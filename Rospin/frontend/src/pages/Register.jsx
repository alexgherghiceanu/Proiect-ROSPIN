import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Registration failed");
      // after register, auto-login or redirect to login
      navigate("/login");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={submit}>
        <h2>Create account</h2>
        <p className="muted">Takes 10 seconds</p>

        <label className="label">E-mail</label>
        <input className="input" value={email} onChange={(e)=>setEmail(e.target.value)} required/>

        <label className="label">Password</label>
        <input className="input" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required/>

        {err && <div className="alert">{err}</div>}

        <button className="btn primary big" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>

        <p className="muted small">Already have an account? <Link to="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
