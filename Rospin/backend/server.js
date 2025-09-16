// server.js
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";
import dotenv from "dotenv";

// Node 18+ has global `fetch` – no need for node-fetch
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// ---- Download service base URL (single source of truth) ----
// In Docker compose networking, use http://download:8010
// Locally (without Docker), use http://localhost:8010
const DOWNLOAD_BASE =
  process.env.DL_API_URL ||
  process.env.DOWNLOAD_BASE_URL ||
  "http://download:8010";

console.log("DOWNLOAD_BASE =", DOWNLOAD_BASE);

// ---------------------- MongoDB ----------------------
mongoose
  .connect(process.env.MONGO_URI, {
    // Note: newUrlParser/unifiedTopology no longer required on driver ≥4
  })
  .then(() =>
    console.log("✅ Connected to MongoDB", process.env.MONGO_URI)
  )
  .catch((err) =>
    console.error("❌ MongoDB connection error:", err)
  );

// ---------------------- User model ----------------------
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
});
const User = mongoose.model("User", userSchema);

// ---------------------- Auth routes ----------------------
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashed });
    await user.save();

    res.json({ message: "User registered!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: "Invalid credentials" });

  const token = jwt.sign({ id: user._id }, "secretkey", { expiresIn: "1h" });
  res.json({ token });
});

// ---------------------- Backend health ----------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ---------------------- Download_V2 proxies ----------------------

// GET /api/download/health  -> proxies to Flask /health
app.get("/api/download/health", async (req, res) => {
  try {
    const r = await fetch(`${DOWNLOAD_BASE}/health`, { method: "GET" });
    const text = await r.text();
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return res.status(r.status).json(JSON.parse(text));
    }
    return res.status(r.status).type(ct || "text/plain").send(text);
  } catch (e) {
    console.error("download/health error:", e);
    res
      .status(502)
      .json({ error: "Download service unreachable", detail: String(e) });
  }
});

// POST /api/download/run -> proxies to Flask /run
// Body can include: { bbox, wkt, start, end, startDate, endDate, ... } (we forward as-is)
// Run: POST /api/download/run  -> proxy to Flask (/run or /download)
app.post("/api/download/run", async (req, res) => {
  const base = process.env.DL_API_URL || "http://download:8010";
  const payload = {
    bbox:  req.body.bbox,
    wkt:   req.body.wkt,
    start: req.body.start,
    end:   req.body.end,
  };

  async function hit(path) {
    const r = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    return { status: r.status, ok: r.ok, text };
  }

  try {
    // try /run first; if 404, try /download
    let r = await hit("/run");
    if (r.status === 404) r = await hit("/download");

    try {
      const json = JSON.parse(r.text);
      return res.status(r.ok ? 200 : r.status).json(json);
    } catch {
      return res.status(r.ok ? 200 : r.status).send(r.text);
    }
  } catch (e) {
    return res
      .status(502)
      .json({ error: "Download service unreachable", detail: String(e.message || e) });
  }
});


// (kept) legacy route if your UI ever calls it
app.post("/api/download-v2", async (req, res) => {
  try {
    const r = await fetch(`${DOWNLOAD_BASE}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const text = await r.text();
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return res.status(r.status).json(JSON.parse(text));
    }
    return res.status(r.status).type(ct || "text/plain").send(text);
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
});

// ---------------------- Start server ----------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
