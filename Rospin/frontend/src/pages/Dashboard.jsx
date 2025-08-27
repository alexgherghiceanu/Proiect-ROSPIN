import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader, DrawingManager } from "@react-google-maps/api";
import { apiPost, apiGet } from "../api/client";
import "./dashboard.css"; // <- add

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const mapContainerStyle = { width: "100%", height: "100%" };

export default function Dashboard() {
  const [coords, setCoords] = useState({ lat: 51.505, lng: -0.09 });
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [status, setStatus] = useState("");

  // job polling
  const [jobId, setJobId] = useState(null);
  const [jobInfo, setJobInfo] = useState(null);
  const pollTimer = useRef(null);

  // import AOI text
  const [importText, setImportText] = useState("");

  const mapRef = useRef(null);
  const mapShapeRef = useRef(null);
  const drawingManagerRef = useRef(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GMAPS_KEY,
    libraries: ["drawing"],
  });

  // ---------- helpers ----------
  const polygonToWKT = (arr) => {
    if (!arr?.length) return "";
    const ring = arr.map((p) => `${p.lng} ${p.lat}`);
    if (ring[ring.length - 1] !== ring[0]) ring.push(ring[0]);
    return `POLYGON((${ring.join(",")}))`;
  };
  const norm = (p) => ({
    lat: typeof p.lat === "function" ? p.lat() : p.lat,
    lng: typeof p.lng === "function" ? p.lng() : p.lng,
  });
  const rectangleToWKT = (ne, sw) => {
    const NE = norm(ne), SW = norm(sw);
    const NW = { lng: SW.lng, lat: NE.lat };
    const SE = { lng: NE.lng, lat: SW.lat };
    const ring = [SW, SE, NE, NW, SW].map((p) => `${p.lng} ${p.lat}`).join(",");
    return `POLYGON((${ring}))`;
  };
  const rectToBBOX = (ne, sw) => {
    const NE = norm(ne), SW = norm(sw);
    return `${SW.lng},${SW.lat},${NE.lng},${NE.lat}`;
  };
  const coordsToBBOX = (arr) => {
    const lats = arr.map((p) => p.lat), lngs = arr.map((p) => p.lng);
    return `${Math.min(...lngs)},${Math.min(...lats)},${Math.max(...lngs)},${Math.max(...lats)}`;
  };

  const centerOfRegion = useMemo(() => {
    if (!region) return coords;
    if (region.type === "polygon") {
      const lats = region.coords.map((p) => p.lat);
      const lngs = region.coords.map((p) => p.lng);
      return { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
    }
    if (region.type === "rectangle") {
      return {
        lat: (region.southWest.lat + region.northEast.lat) / 2,
        lng: (region.southWest.lng + region.northEast.lng) / 2,
      };
    }
    return coords;
  }, [region, coords]);

  // ---------- effects ----------
  useEffect(() => {
    fetch("https://ipwho.is/").then(r=>r.json()).then(d=>{
      if (d.latitude && d.longitude) setCoords({ lat: d.latitude, lng: d.longitude });
    }).finally(()=>setLoading(false));
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("rospin_dashboard");
    if (!saved) return;
    try {
      const { region, start, end } = JSON.parse(saved);
      if (region) setRegion(region);
      if (start) setStart(start);
      if (end) setEnd(end);
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem("rospin_dashboard", JSON.stringify({ region, start, end }));
  }, [region, start, end]);

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    if (mapShapeRef.current) { mapShapeRef.current.setMap(null); mapShapeRef.current = null; }
    if (!region) return;

    if (region.type === "polygon" && region.coords?.length) {
      const poly = new window.google.maps.Polygon({
        paths: region.coords,
        map: mapRef.current,
        fillColor: "#2196F3", fillOpacity: 0.3, strokeColor: "#0D47A1", strokeWeight: 2,
      });
      mapShapeRef.current = poly;
      const lats = region.coords.map(p => p.lat), lngs = region.coords.map(p => p.lng);
      mapRef.current.panTo({ lat:(Math.min(...lats)+Math.max(...lats))/2, lng:(Math.min(...lngs)+Math.max(...lngs))/2 });
    } else if (region.type === "rectangle" && region.northEast && region.southWest) {
      const rect = new window.google.maps.Rectangle({
        bounds: { north: region.northEast.lat, east: region.northEast.lng, south: region.southWest.lat, west: region.southWest.lng },
        map: mapRef.current,
        fillColor: "#4CAF50", fillOpacity: 0.3, strokeColor: "#1B5E20", strokeWeight: 2,
      });
      mapShapeRef.current = rect;
      mapRef.current.panTo({
        lat: (region.southWest.lat + region.northEast.lat) / 2,
        lng: (region.southWest.lng + region.northEast.lng) / 2,
      });
    }
  }, [isLoaded, region]);

  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current); }, []);

  // ---------- actions ----------
  const deleteRegion = () => {
    if (mapShapeRef.current) { mapShapeRef.current.setMap(null); mapShapeRef.current = null; }
    setRegion(null); setStatus("");
  };
  const copy = async (text, label) => {
    try { await navigator.clipboard.writeText(text); setStatus(`${label} copied ✅`); }
    catch { setStatus(`Could not copy ${label}`); }
    setTimeout(()=>setStatus(""), 1500);
  };
  const recenter = () => { if (mapRef.current && region) mapRef.current.panTo(centerOfRegion); };
  const buildCLI = () => !region || !start || !end ? "" : `python .\\main.py --username "YOUR_EMAIL" --start ${start} --end ${end} --aoi "${region.wkt}"`;

  const importAOI = () => {
    const t = importText.trim();
    if (!t) return;

    const bboxMatch = t.match(/^\s*(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)\s*$/);
    if (bboxMatch) {
      const [minLng, minLat, maxLng, maxLat] = [parseFloat(bboxMatch[1]), parseFloat(bboxMatch[3]), parseFloat(bboxMatch[5]), parseFloat(bboxMatch[7])];
      const ne = { lat: maxLat, lng: maxLng }, sw = { lat: minLat, lng: minLng };
      const wkt = rectangleToWKT(ne, sw);
      const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;
      setRegion({ type:"rectangle", northEast:ne, southWest:sw, wkt, bbox });
      setImportText(""); return;
    }

    const polyMatch = /POLYGON\s*\(\(\s*(.+?)\s*\)\)/i.exec(t);
    if (polyMatch) {
      const parts = polyMatch[1].split(",").map(s=>s.trim());
      const coords = parts.map(p => {
        const [lng, lat] = p.split(/\s+/).map(Number);
        return { lat, lng };
      });
      const wkt = polygonToWKT(coords);
      const bbox = coordsToBBOX(coords);
      setRegion({ type:"polygon", coords, wkt, bbox });
      setImportText(""); return;
    }
    setStatus("AOI format not recognized. Paste BBOX or WKT POLYGON.");
    setTimeout(()=>setStatus(""), 2000);
  };

  const runAnalysis = async () => {
    if (!region || !start || !end) return;
    setStatus("Submitting analysis job…");
    try {
      const { jobId } = await apiPost("/api/run-flood", {
        aoi_wkt: region.wkt,
        bbox: region.bbox,
        start, end,
      });
      setJobId(jobId);
      setStatus(`Job submitted: ${jobId}. Polling…`);
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = setInterval(async () => {
        try {
          const info = await apiGet(`/api/jobs/${jobId}`);
          setJobInfo(info);
          if (info.status === "completed" || info.status === "failed") {
            clearInterval(pollTimer.current);
            pollTimer.current = null;
            setStatus(info.status === "completed" ? "✅ Analysis complete" : "❌ Analysis failed");
          }
        } catch (e) {
          clearInterval(pollTimer.current);
          pollTimer.current = null;
          setStatus(`Polling error: ${String(e.message || e)}`);
        }
      }, 2000);
    } catch (e) {
      setStatus(`Backend not ready: ${String(e.message || e)}`);
    }
  };

  // ---------- render ----------
  if (!GMAPS_KEY) return <div style={{ padding: 16, color: "#b91c1c" }}>Missing VITE_GOOGLE_MAPS_API_KEY in .env.local</div>;
  if (loadError)   return <div style={{ padding: 16, color: "#b91c1c" }}>Map failed to load: {String(loadError)}</div>;
  if (loading || !isLoaded) return <p style={{ padding: 16 }}>Loading map…</p>;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", width:"100vw" }}>
      <header className="dash-header">My Dashboard</header>

      <main style={{ display:"flex", flex:1, minHeight:0 }}>
        {/* Sidebar */}
        <aside className="dash-sidebar" style={{ width: 380, overflowY:"auto" }}>
          <h2 className="h2">Region &amp; Analysis</h2>

          {/* Import AOI */}
          <div style={{ marginBottom: 12 }}>
            <label className="label">Import AOI (BBOX or WKT POLYGON)</label>
            <textarea className="textarea" rows={3} value={importText} onChange={e=>setImportText(e.target.value)} />
            <button className="btn" style={{ marginTop:8 }} onClick={importAOI}>Set AOI</button>
          </div>

          {/* Dates */}
          <div style={{ marginBottom: 12 }}>
            <label className="label">Start date</label>
            <input className="input" type="date" value={start} onChange={e=>setStart(e.target.value)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="label">End date</label>
            <input className="input" type="date" value={end} onChange={e=>setEnd(e.target.value)} />
          </div>

          {region ? (
            <div className="card">
              <button onClick={deleteRegion} title="Clear region" className="btn danger" style={{ position:"absolute", top:8, right:8 }}>Clear</button>
              <h3 style={{ fontWeight:600, marginBottom:8 }}>Selected {region.type === "polygon" ? "Polygon" : "Rectangle"}</h3>

              {region.type === "polygon" ? (
                <details open style={{ marginBottom:8 }}>
                  <summary className="label" style={{ cursor:"pointer", marginBottom:6 }}>Vertices</summary>
                  <ul style={{ paddingLeft:16 }}>
                    {region.coords.map((c, i) => <li key={i}>{c.lat.toFixed(5)}, {c.lng.toFixed(5)}</li>)}
                  </ul>
                </details>
              ) : (
                <div style={{ marginBottom:8 }}>
                  <div><b>NE:</b> {region.northEast.lat.toFixed(5)}, {region.northEast.lng.toFixed(5)}</div>
                  <div><b>SW:</b> {region.southWest.lat.toFixed(5)}, {region.southWest.lng.toFixed(5)}</div>
                </div>
              )}

              <div style={{ marginBottom:8 }}>
                <div className="kv">
                  <label className="label" style={{ margin:0 }}>WKT</label>
                  <button className="copy" onClick={()=>copy(region.wkt,"WKT")}>Copy</button>
                </div>
                <textarea className="textarea" readOnly rows={3} value={region.wkt} />
              </div>

              <div style={{ marginBottom:8 }}>
                <div className="kv">
                  <label className="label" style={{ margin:0 }}>BBOX (minLng,minLat,maxLng,maxLat)</label>
                  <button className="copy" onClick={()=>copy(region.bbox,"BBOX")}>Copy</button>
                </div>
                <input className="input" readOnly value={region.bbox} />
              </div>

              <div className="kv" style={{ marginTop:8 }}>
                <button className="btn" onClick={recenter}>Recenter</button>
                <button className="btn success" onClick={runAnalysis} disabled={!start || !end}>Run (API)</button>
              </div>

              <div style={{ marginTop:12 }}>
                <label className="label">Run via Python (CLI)</label>
                <textarea className="textarea" readOnly rows={3} value={buildCLI()} />
                <button className="btn" style={{ marginTop:8 }} onClick={()=>copy(buildCLI(),"CLI command")} disabled={!region || !start || !end}>
                  Copy CLI
                </button>
              </div>

              {jobId && (
                <div style={{ marginTop:12, fontSize:13, borderTop:"1px dashed var(--border)", paddingTop:8 }}>
                  <div><b>Job:</b> {jobId}</div>
                  <div><b>Status:</b> {jobInfo?.status || "pending…"}</div>
                  {jobInfo?.result && (
                    <div style={{ marginTop:6 }}>
                      <div><b>Flooded %:</b> {Number(jobInfo.result.flooded_pct).toFixed(2)}%</div>
                      <div><b>Date:</b> {new Date(jobInfo.result.post_date).toLocaleDateString()}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="small">Draw a polygon or rectangle on the map, or paste a BBOX/WKT and click “Set AOI”.</p>
          )}

          {status && <p className="status">{status}</p>}
        </aside>

        {/* Map column */}
        <div style={{ flex: 1, minHeight: 600 }}>
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={region ? centerOfRegion : coords}
            zoom={region ? 11 : 12}
            options={{ mapTypeId: "satellite", gestureHandling: "greedy" }}
            onLoad={(map) => (mapRef.current = map)}
          >
            <Marker position={coords} />

            {!drawingManagerRef.current && (
              <DrawingManager
                onLoad={(dm) => (drawingManagerRef.current = dm)}
                onPolygonComplete={(polygon) => {
                  if (mapShapeRef.current) { alert("Delete the existing region first."); polygon.setMap(null); return; }
                  const path = polygon.getPath();
                  const coordsArray = [];
                  for (let i = 0; i < path.getLength(); i++) {
                    const pt = path.getAt(i);
                    coordsArray.push({ lat: pt.lat(), lng: pt.lng() });
                  }
                  const newPolygon = new window.google.maps.Polygon({
                    paths: coordsArray, map: mapRef.current, fillColor:"#2196F3", fillOpacity:0.3, strokeColor:"#0D47A1", strokeWeight:2,
                  });
                  mapShapeRef.current = newPolygon;
                  setRegion({ type:"polygon", coords: coordsArray, wkt: polygonToWKT(coordsArray), bbox: coordsToBBOX(coordsArray) });
                  polygon.setMap(null);
                }}
                onRectangleComplete={(rectangle) => {
                  if (mapShapeRef.current) {
                    alert("Delete the existing region before drawing a new one.");
                    rectangle.setMap(null);
                    return;
                  }
                  const bounds = rectangle.getBounds();
                  const ne = bounds.getNorthEast();
                  const sw = bounds.getSouthWest();
                  const newRectangle = new window.google.maps.Rectangle({
                    bounds: { north: ne.lat(), east: ne.lng(), south: sw.lat(), west: sw.lng() },
                    map: mapRef.current,
                    fillColor: "#4CAF50",
                    fillOpacity: 0.3,
                    strokeColor: "#1B5E20",
                    strokeWeight: 2,
                  });
                  mapShapeRef.current = newRectangle;

                  const northEast = { lat: ne.lat(), lng: ne.lng() };
                  const southWest = { lat: sw.lat(), lng: sw.lng() };
                  const wkt = rectangleToWKT(northEast, southWest);
                  const bbox = rectToBBOX(northEast, southWest);

                  setRegion({ type: "rectangle", northEast, southWest, wkt, bbox });
                  rectangle.setMap(null);
                }}
                options={{
                  drawingControl: true,
                  drawingControlOptions: {
                    position: window.google.maps.ControlPosition.TOP_CENTER,
                    drawingModes: ["polygon", "rectangle"],
                  },
                }}
              />
            )}
          </GoogleMap>
        </div>
      </main>
    </div>
  );
}
