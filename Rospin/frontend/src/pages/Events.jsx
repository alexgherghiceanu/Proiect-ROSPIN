import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

function wktPolygonToRegion(wkt) {
  const m = /POLYGON\s*\(\(\s*(.+?)\s*\)\)/i.exec(wkt || "");
  if (!m) return null;
  const parts = m[1].split(",").map(s => s.trim());
  const coords = parts.map(p => {
    const [lng, lat] = p.split(/\s+/).map(Number);
    return { lat, lng };
  });
  // bbox helper
  const lats = coords.map(p => p.lat), lngs = coords.map(p => p.lng);
  const bbox = `${Math.min(...lngs)},${Math.min(...lats)},${Math.max(...lngs)},${Math.max(...lats)}`;
  return { type:"polygon", coords, wkt, bbox };
}

export default function Events() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/flood-events`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")||""}` }
        });
        if (!res.ok) throw new Error("No /api/flood-events yet; showing demo.");
        setRows(await res.json());
      } catch (e) {
        setErr(String(e.message || e));
        // demo event (use your Bucharest bbox)
        setRows([
          {
            id: 1,
            post_date: "2024-04-04",
            flooded_pct: 0.0,
            aoi_wkt: "POLYGON((26.05 44.39,26.25 44.39,26.25 44.52,26.05 44.52,26.05 44.39))",
          },
        ]);
      }
    })();
  }, []);

  const viewOnMap = (wkt) => {
    const region = wktPolygonToRegion(wkt);
    if (!region) return;
    nav("/dashboard", { state: { region } });
  };

  return (
    <div style={{maxWidth:900,margin:"16px auto",padding:"0 16px"}}>
      <h1 style={{fontSize:24,fontWeight:700,marginBottom:12}}>Flood Events</h1>
      {err && <p style={{color:"#92400e"}}>{err}</p>}

      <div style={{overflowX:"auto",border:"1px solid #e5e7eb",borderRadius:8}}>
        <table style={{width:"100%",fontSize:14}}>
          <thead style={{background:"#f9fafb"}}>
            <tr>
              <th style={{textAlign:"left",padding:8}}>ID</th>
              <th style={{textAlign:"left",padding:8}}>Date</th>
              <th style={{textAlign:"left",padding:8}}>% Flooded</th>
              <th style={{textAlign:"left",padding:8}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{borderTop:"1px solid #e5e7eb"}}>
                <td style={{padding:8}}>{r.id}</td>
                <td style={{padding:8}}>{new Date(r.post_date).toLocaleDateString()}</td>
                <td style={{padding:8}}>{(r.flooded_pct ?? 0).toFixed(2)}%</td>
                <td style={{padding:8}}>
                  <button onClick={() => viewOnMap(r.aoi_wkt)} style={{padding:"6px 10px",borderRadius:6,border:"1px solid #d1d5db",cursor:"pointer"}}>
                    View on map
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={4} style={{padding:12,color:"#6b7280"}}>No events yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
