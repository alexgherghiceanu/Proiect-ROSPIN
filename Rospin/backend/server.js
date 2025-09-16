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

const DL = process.env.DL_API_URL || "http://download:8010"; // default corect pt Docker

// Health → proxy la Flask /health
app.get("/api/download/health", async (req, res) => {
  try {
    const r = await fetch(`${DL}/health`);
    const txt = await r.text();
    // dacă e JSON, returnează JSON; altfel text
    try { res.status(r.ok ? 200 : 500).json(JSON.parse(txt)); }
    catch { res.status(r.ok ? 200 : 500).send(txt); }
  } catch (e) {
    res.status(502).json({ error: "Download service unreachable", detail: String(e.message || e) });
  }
});

// Run → proxy la Flask /run  (BODY: {bbox, wkt, start, end})
// POST /api/download/run  -> proxy la Flask (/run sau /download)
app.post("/api/download/run", async (req, res) => {
  const body = JSON.stringify(req.body ?? {});
  const headers = { "Content-Type": "application/json" };

  async function tryPath(path) {
    const r = await fetch(`${DL}${path}`, { method: "POST", headers, body });
    const txt = await r.text();
    try { return { status: r.status, ok: r.ok, json: JSON.parse(txt) }; }
    catch { return { status: r.status, ok: r.ok, text: txt }; }
  }

  try {
    // 1) încearcă /run
    let resp = await tryPath("/run");
    // 2) dacă nu există, încearcă /download
    if (resp.status === 404) resp = await tryPath("/download");

    if (resp.json) return res.status(resp.ok ? 200 : resp.status).json(resp.json);
    return res.status(resp.ok ? 200 : resp.status).send(resp.text);
  } catch (e) {
    return res.status(500).json({ error: "Download service error", detail: String(e.message || e) });
  }
});


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
// --- keep your imports & app setup as-is above ---

// Health proxy stays the same
app.get("/api/download/health", async (req, res) => {
  try {
    const r = await fetch(`${DL}/health`);
    const txt = await r.text();
    try { res.status(r.ok ? 200 : 500).json(JSON.parse(txt)); }
    catch { res.status(r.ok ? 200 : 500).send(txt); }
  } catch (e) {
    res.status(502).json({ error: "Download service unreachable", detail: String(e.message || e) });
  }
});

// === Accept both legacy ({bbox,wkt,start,end}) and new ({aoi,start,end}) ===
app.post("/api/download/run", async (req, res) => {
  try {
    let { aoi, bbox, wkt, start, end } = req.body || {};

    // Build 'aoi' if the UI sent legacy fields
    if (!aoi) {
      if (bbox) aoi = { type: "bbox", value: String(bbox) };
      else if (wkt) aoi = { type: "wkt", value: String(wkt) };
    }

    // Basic guard (and echo what we got for easier debugging)
    if (!aoi || !start || !end) {
      return res.status(400).json({ ok: false, error: "Missing aoi/start/end", got: req.body });
    }

    // Normalize payload for Flask
    const payload = {
      aoi,
      start: String(start).slice(0, 10),
      end: String(end).slice(0, 10),
    };

    // Forward to Flask NEW endpoint (/download)
    const r = await fetch(`${DL}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const txt = await r.text();
    let out;
    try { out = JSON.parse(txt); } catch { out = { raw: txt }; }
    res.status(r.ok ? 200 : 500).json(out);
  } catch (e) {
    res.status(500).json({ ok: false, error: "Download service error", detail: String(e.message || e) });
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
