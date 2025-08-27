import { Link, useNavigate } from "react-router-dom";

export default function NavBar() {
  const token = localStorage.getItem("token");
  const nav = useNavigate();
  const logout = () => { localStorage.removeItem("token"); nav("/login"); };

  return (
    <header className="header">
      <div className="navbar">
        <Link to="/" className="brand">ROSPIN</Link>
        <nav className="nav">
          <Link to="/">Home</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/events">Events</Link>
          {token
            ? <button className="btn danger" onClick={logout}>Logout</button>
            : <Link to="/login">Login</Link>}
        </nav>
      </div>
    </header>
  );
}
