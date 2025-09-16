// src/components/Navbar.jsx
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(!!localStorage.getItem("token"));
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    setOpen(false); // close menu on route change
    setAuthed(!!localStorage.getItem("token"));
  }, [loc.pathname]);

  const logout = () => {
    localStorage.removeItem("token");
    setAuthed(false);
    navigate("/");
  };

  return (
    <header className="header">
      <nav className="navbar">
        {/* Left: Brand */}
        <div className="brandWrap">
          <span className="logo">🛰️</span>
          <NavLink to="/" className="brand">ROSPIN</NavLink>
        </div>

        {/* Mobile toggle (right on the bar) */}
        <button
          className={`hamburger ${open ? "is-open" : ""}`}
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          <span /><span /><span />
        </button>

        {/* Right: links + auth */}
        <div className={`nav ${open ? "open" : ""}`}>
          <div className="navRow">
            <div className="navLinks">
              <NavLink to="/" className={({isActive}) => isActive ? "active" : ""}>
                Home
              </NavLink>
              {authed && (
                <NavLink to="/dashboard" className={({isActive}) => isActive ? "active" : ""}>
                  Dashboard
                </NavLink>
              )}
            </div>

            <div className="navAuth">
              {!authed ? (
                <>
                  <NavLink to="/login" className="btn ghost small">Login</NavLink>
                  <NavLink to="/register" className="btn primary small">Register</NavLink>
                </>
              ) : (
                <button className="btn danger small" onClick={logout}>Logout</button>
              )}
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
