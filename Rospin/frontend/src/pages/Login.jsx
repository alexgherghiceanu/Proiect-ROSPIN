import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiPost } from "../api/client";
import "../styles.css";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const data = await apiPost("/login", { username, password });
      if (!data?.token) throw new Error("Invalid response from server");
      localStorage.setItem("token", data.token);
      nav("/dashboard");
    } catch (e) {
      setErr(typeof e === "string" ? e : (e.message || "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page center">
      <form onSubmit={submit} className="card auth-card stack">
        <h2 style={{margin:0}}>Login</h2>
        <p className="note" style={{marginTop:-6}}>Welcome back — sign in to continue.</p>

        {err && <div className="alert">{err}</div>}

        <div>
          <label className="label">Username</label>
          <input className="input" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" />
        </div>

        <div className="actions">
          <button className="btn primary" type="submit" disabled={loading || !username || !password}>
            {loading ? "Signing in…" : "Login"}
          </button>
          <Link className="btn" to="/register">Create account</Link>
        </div>
      </form>
    </div>
  );
}
