import { Link, useNavigate } from "react-router-dom";
import "./styles.css";

export default function App() {
  const token = localStorage.getItem("token");
  const nav = useNavigate();

  return (
    <div className="page">
      <div className="hero">
        <h1>Welcome to <strong>ROSPIN</strong> 🚀</h1>
        <p>
          Detect and analyze floods from satellite imagery. Draw your Area of
          Interest, pick a date range, and run the analysis — results are saved for later review.
        </p>

        <div className="cta">
          {token ? (
            <button className="btn primary" onClick={() => nav("/dashboard")}>
              Go to Dashboard
            </button>
          ) : (
            <>
              <Link className="btn primary" to="/login">Login</Link>
              <Link className="btn" to="/register">Register</Link>
            </>
          )}
          <Link className="btn" to="/events">View Events</Link>
        </div>

        <p className="note" style={{marginTop:14}}>
          Tip: you can paste a BBOX or WKT polygon directly on the Dashboard.
        </p>
      </div>
    </div>
  );
}

