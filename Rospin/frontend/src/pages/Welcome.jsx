import { Link } from "react-router-dom";

function IconPolygon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 3l8 0 5 9-5 9H8L3 12 8 3z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="3" r="1.6" fill="currentColor"/><circle cx="16" cy="3" r="1.6" fill="currentColor"/>
      <circle cx="21" cy="12" r="1.6" fill="currentColor"/><circle cx="16" cy="21" r="1.6" fill="currentColor"/>
      <circle cx="8" cy="21" r="1.6" fill="currentColor"/><circle cx="3" cy="12" r="1.6" fill="currentColor"/>
    </svg>
  );
}
function IconRadar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M12 12l6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <circle cx="18" cy="6" r="2" fill="currentColor"/>
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}
function IconWater() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3s6 7 6 11a6 6 0 1 1-12 0c0-4 6-11 6-11z" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M7.5 16c1 .9 2.3 1.5 4.5 1.5S15.5 16.9 16.5 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

export default function Welcome() {
  return (
    <section className="hero">
      <div className="hero__bg" />
      <div className="hero__inner">
        <div className="hero__badge">Sentinel-1 • Flood Risk</div>
        <h1 className="hero__title">
          Rapid <span className="gradText">flood analysis</span> for your area of interest
        </h1>
        <p className="hero__subtitle">
          Draw a polygon/rectangle, pick dates, and estimate flooded area from pre/post SAR imagery.
        </p>

        <div className="hero__actions">
          <Link to="/dashboard" className="btn primary big">Open Dashboard</Link>
          <Link to="/register" className="btn glass big">Create account</Link>
        </div>

        <div className="hero__cards">
          <div className="card feature">
            <div className="feature__icon"><IconPolygon /></div>
            <h3>Draw AOI</h3>
            <p>Polygon/rectangle tools with instant WKT &amp; BBOX.</p>
          </div>
          <div className="card feature">
            <div className="feature__icon"><IconRadar /></div>
            <h3>Pre/Post Images</h3>
            <p>Automated download (backend) &amp; change detection pipeline.</p>
          </div>
          <div className="card feature">
            <div className="feature__icon"><IconWater /></div>
            <h3>Results</h3>
            <p>Flooded percentage &amp; snapshot date stored in MongoDB.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

