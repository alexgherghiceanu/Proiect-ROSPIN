import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiPost } from "../api/client";
import "../styles.css";

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (password !== confirm) { setErr("Passwords do not match."); return; }
    setLoading(true);
    try {
      // Your backend may return token or just success; we’ll navigate to login on success
      await apiPost("/register", { username, password });
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
        <h2 style={{margin:0}}>Create account</h2>
        <p className="note" style={{marginTop:-6}}>Join ROSPIN and start analyzing floods.</p>

        {err && <div className="alert">{err}</div>}

        <div>
          <label className="label">Username</label>
          <input className="input" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" />
        </div>
        <div>
          <label className="label">Confirm password</label>
          <input className="input" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" />
        </div>

        <div className="actions">
          <button className="btn primary" type="submit" disabled={loading || !username || !password || !confirm}>
            {loading ? "Creating…" : "Register"}
          </button>
          <Link className="btn" to="/login">Back to login</Link>
        </div>
      </form>
    </div>
  );
}
