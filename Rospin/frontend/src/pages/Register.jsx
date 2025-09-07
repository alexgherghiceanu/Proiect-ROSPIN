import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiPost } from "../api/client";
import "../styles.css";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr("");

    // check password match
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }

    // check email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setErr("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      await apiPost("/register", { email, password });
      nav("/login");
    } catch (e) {
      setErr(typeof e === "string" ? e : (e.message || "Registration failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page center">
      <form onSubmit={submit} className="card auth-card stack">
        <h2 style={{ margin: 0 }}>Create account</h2>
        <p className="note" style={{ marginTop: -6 }}>
          Join ROSPIN and start analyzing floods.
        </p>

        {err && <div className="alert">{err}</div>}

        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div>
          <label className="label">Confirm password</label>
          <input
            className="input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <div className="actions">
          <button
            className="btn primary"
            type="submit"
            disabled={loading || !email || !password || !confirm}
          >
            {loading ? "Creating…" : "Register"}
          </button>
          <Link className="btn" to="/login">Back to login</Link>
        </div>
      </form>
    </div>
  );
}
