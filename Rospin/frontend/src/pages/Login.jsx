import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  const login = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Login failed");
      localStorage.setItem("token", data.token);
      navigate("/dashboard");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={login}>
        <h2>Welcome back</h2>
        <p className="muted">Log in to access the dashboard</p>

        <label className="label">E-mail</label>
        <input className="input" value={email} onChange={(e)=>setEmail(e.target.value)} required/>

        <label className="label">Password</label>
        <input className="input" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required/>

        {err && <div className="alert">{err}</div>}

        <button className="btn primary big" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="muted small">No account? <Link to="/register">Create one</Link></p>
      </form>
    </div>
  );
}

