import React, { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader, DrawingManager } from "@react-google-maps/api";
import { apiPost, apiGet } from "../api/client";
import { downloadAPI } from "../api/download";
import "./dashboard.css";

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const GMAPS_LIBS = ["drawing"];           // stable, declared once
const mapContainerStyle = { width: "100%", height: "100%" };


function Step({ n, title, children, done }) {
  return (
    <div className="card" style={{ position: "relative", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div
          aria-hidden
          style={{
            width: 26,
            height: 26,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            background: done ? "var(--success)" : "var(--brand)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            flex: "0 0 auto",
          }}
        >
          {n}
        </div>
        <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function Dashboard() {
  // map + region
  const [coords, setCoords] = useState({ lat: 51.505, lng: -0.09 });
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState(null);
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GMAPS_KEY,
    libraries: GMAPS_LIBS,                 // use the stable array
  });

  // dates
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  // analysis job
  const [status, setStatus] = useState("");
  const [jobId, setJobId] = useState(null);
  const [jobInfo, setJobInfo] = useState(null);
  const pollTimer = useRef(null);

  // download_v2
  const [dlTaskId, setDlTaskId] = useState(null);
  const [dlStatus, setDlStatus] = useState("");
  const [dlHealth, setDlHealth] = useState(null);
  const dlTimer = useRef(null);

  // aoi import (advanced)
  const [importText, setImportText] = useState("");

  // refs
  const mapRef = useRef(null);
  const mapShapeRef = useRef(null);
  const drawingManagerRef = useRef(null);

  // Duplicate useJsApiLoader removed to fix redeclaration error

  // ---------------- helpers (kept from your code) ----------------
  const norm = (p) => ({
    lat: typeof p.lat === "function" ? p.lat() : p.lat,
    lng: typeof p.lng === "function" ? p.lng() : p.lng,
  });

  const polygonToWKT = (arr) => {
    if (!arr?.length) return "";
    const ring = arr.map((p) => `${p.lng} ${p.lat}`);
    if (ring[ring.length - 1] !== ring[0]) ring.push(ring[0]);
    return `POLYGON((${ring.join(",")}))`;
  };

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

  const shortAreaLabel = () => {
    if (!region) return "Nicio zonă selectată";
    if (region.type === "polygon") return `Poligon cu ${region.coords.length} puncte`;
    return "Dreptunghi selectat";
  };

  // ---------------- effects ----------------
  // locate user
  useEffect(() => {
    fetch("https://ipwho.is/")
      .then((r) => r.json())
      .then((d) => {
        if (d.latitude && d.longitude) setCoords({ lat: d.latitude, lng: d.longitude });
      })
      .finally(() => setLoading(false));
  }, []);

  // restore saved state
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

  // persist on change
  useEffect(() => {
    localStorage.setItem("rospin_dashboard", JSON.stringify({ region, start, end }));
  }, [region, start, end]);

  // re-draw saved shape
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    if (mapShapeRef.current) {
      mapShapeRef.current.setMap(null);
      mapShapeRef.current = null;
    }
    if (!region) return;

    if (region.type === "polygon" && region.coords?.length) {
      const poly = new window.google.maps.Polygon({
        paths: region.coords,
        map: mapRef.current,
        fillColor: "#2196F3",
        fillOpacity: 0.3,
        strokeColor: "#0D47A1",
        strokeWeight: 2,
      });
      mapShapeRef.current = poly;
      const lats = region.coords.map((p) => p.lat),
        lngs = region.coords.map((p) => p.lng);
      mapRef.current.panTo({
        lat: (Math.min(...lats) + Math.max(...lats)) / 2,
        lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      });
    } else if (region.type === "rectangle" && region.northEast && region.southWest) {
      const rect = new window.google.maps.Rectangle({
        bounds: {
          north: region.northEast.lat,
          east: region.northEast.lng,
          south: region.southWest.lat,
          west: region.southWest.lng,
        },
        map: mapRef.current,
        fillColor: "#4CAF50",
        fillOpacity: 0.3,
        strokeColor: "#1B5E20",
        strokeWeight: 2,
      });
      mapShapeRef.current = rect;
      mapRef.current.panTo({
        lat: (region.southWest.lat + region.northEast.lat) / 2,
        lng: (region.southWest.lng + region.northEast.lng) / 2,
      });
    }
  }, [isLoaded, region]);

  // clear timers on unmount
  useEffect(
    () => () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (dlTimer.current) clearInterval(dlTimer.current);
    },
    []
  );

  // ---------------- actions (kept, but friendlier UI) ----------------
  const deleteRegion = () => {
    if (mapShapeRef.current) {
      mapShapeRef.current.setMap(null);
      mapShapeRef.current = null;
    }
    setRegion(null);
    setStatus("");
  };

  const recenter = () => {
    if (mapRef.current && region) mapRef.current.panTo(centerOfRegion);
  };

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`${label} copiat ✅`);
    } catch {
      setStatus(`Nu am putut copia ${label}`);
    }
    setTimeout(() => setStatus(""), 1500);
  };

  // Advanced: import AOI via text (BBOX/WKT)
  const importAOI = () => {
    const t = importText.trim();
    if (!t) return;

    // BBOX: minLng,minLat,maxLng,maxLat
    const bboxMatch = t.match(
      /^\s*(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)\s*$/
    );
    if (bboxMatch) {
      const [minLng, minLat, maxLng, maxLat] = [
        parseFloat(bboxMatch[1]),
        parseFloat(bboxMatch[3]),
        parseFloat(bboxMatch[5]),
        parseFloat(bboxMatch[7]),
      ];
      const ne = { lat: maxLat, lng: maxLng },
        sw = { lat: minLat, lng: minLng };
      const wkt = rectangleToWKT(ne, sw);
      const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;
      setRegion({ type: "rectangle", northEast: ne, southWest: sw, wkt, bbox });
      setImportText("");
      return;
    }

    // WKT POLYGON
    const polyMatch = /POLYGON\s*\(\(\s*(.+?)\s*\)\)/i.exec(t);
    if (polyMatch) {
      const parts = polyMatch[1].split(",").map((s) => s.trim());
      const coords = parts.map((p) => {
        const [lng, lat] = p.split(/\s+/).map(Number);
        return { lat, lng };
      });
      const wkt = polygonToWKT(coords);
      const bbox = coordsToBBOX(coords);
      setRegion({ type: "polygon", coords, wkt, bbox });
      setImportText("");
      return;
    }

    setStatus("Format necunoscut. Lipește BBOX sau WKT POLYGON.");
    setTimeout(() => setStatus(""), 2000);
  };

  // Download_V2
  const checkDownloadHealth = async () => {
    try {
      const res = await fetch("/api/download/health");
      const data = await res.json();
      setDlHealth(data?.ok ? "OK" : JSON.stringify(data));
      setStatus(data?.ok ? "Download API: OK ✅" : "Download API: răspuns neașteptat");
    } catch (e) {
      setDlHealth(`ERROR: ${e.message || e}`);
      setStatus(`Download API error ❌`);
    } finally {
      setTimeout(() => setStatus(""), 1500);
    }
  };

  const startDownload = async () => {
    if (!region || !start || !end) {
      setStatus("Mai întâi selectează zona și datele.");
      setTimeout(() => setStatus(""), 1500);
      return;
    }
    setDlStatus("Se trimite cererea…");
    try {
      const res = await downloadAPI.run({
        bbox: region.bbox,
        wkt: region.wkt,
        start,
        end,
      });
      const id = res.task_id || res.id || res.taskId;
      setDlTaskId(id);
      setDlStatus(`În coadă (task ${id})`);

      if (dlTimer.current) clearInterval(dlTimer.current);
      dlTimer.current = setInterval(async () => {
        try {
          const s = await downloadAPI.status(id);
          const st = s.status || s.state;
          setDlStatus(st || "...");
          const doneLike = ["DONE", "COMPLETED", "ERROR", "FAILED", "CANCELLED"];
          if (doneLike.includes((st || "").toUpperCase())) {
            clearInterval(dlTimer.current);
            dlTimer.current = null;
          }
        } catch (e) {
          clearInterval(dlTimer.current);
          dlTimer.current = null;
          setDlStatus(`Eroare la polling: ${e.message}`);
        }
      }, 2000);
    } catch (e) {
      setDlStatus(`Eroare la trimitere: ${e.message}`);
    }
  };

  const cancelDownload = async () => {
    if (!dlTaskId) return;
    try {
      await downloadAPI.cancel(dlTaskId);
      setDlStatus("Anulat");
      if (dlTimer.current) clearInterval(dlTimer.current);
      dlTimer.current = null;
    } catch (e) {
      setDlStatus(`Eroare la anulare: ${e.message}`);
    }
  };

  // Analysis
  const runAnalysis = async () => {
    if (!region || !start || !end) return;
    setStatus("Pornesc analiza…");
    try {
      const { jobId } = await apiPost("/api/run-flood", {
        aoi_wkt: region.wkt,
        bbox: region.bbox,
        start,
        end,
      });
      setJobId(jobId);
      setStatus(`Job trimis (#${jobId}) — urmăresc progresul…`);
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = setInterval(async () => {
        try {
          const info = await apiGet(`/api/jobs/${jobId}`);
          setJobInfo(info);
          if (info.status === "completed" || info.status === "failed") {
            clearInterval(pollTimer.current);
            pollTimer.current = null;
            setStatus(info.status === "completed" ? "✅ Analiză finalizată" : "❌ Analiză eșuată");
          }
        } catch (e) {
          clearInterval(pollTimer.current);
          pollTimer.current = null;
          setStatus(`Eroare la polling: ${String(e.message || e)}`);
        }
      }, 2000);
    } catch (e) {
      setStatus(`Backend indisponibil: ${String(e.message || e)}`);
    } finally {
      setTimeout(() => setStatus(""), 1800);
    }
  };

  // ---------------- render ----------------
  if (!GMAPS_KEY)
    return (
      <div style={{ padding: 16, color: "#b91c1c" }}>
        Lipsă VITE_GOOGLE_MAPS_API_KEY în .env.local
      </div>
    );
  if (loadError) return <div style={{ padding: 16, color: "#b91c1c" }}>Map load error: {String(loadError)}</div>;
  if (loading || !isLoaded) return <p style={{ padding: 16 }}>Se încarcă harta…</p>;

  const step1Done = !!region;
  const step2Done = !!(start && end);
  const step3Done = !!(dlStatus && /done|completed/i.test(dlStatus));
  const step4Done = !!(jobInfo && jobInfo.status === "completed");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
      <header className="dash-header">Flood Risk Dashboard</header>

      <main style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Sidebar (wizard) */}
        <aside className="dash-sidebar" style={{ width: 380, overflowY: "auto" }}>
          <h2 className="h2" style={{ marginBottom: 12 }}>Hai să începem 👇</h2>

          <Step n={1} title="Selectează zona (pe hartă)" done={step1Done}>
            {!region ? (
              <p style={{ marginTop: 0 }}>
                Folosește uneltele <b>Polygon</b> sau <b>Rectangle</b> din colțul hărții, apoi apasă pe hartă ca
                să desenezi. Poți oricând să ștergi și să refaci.
              </p>
            ) : (
              <>
                <div className="kv">
                  <div><b>Zonă:</b> {shortAreaLabel()}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={recenter}>Recenter</button>
                    <button className="btn danger" onClick={deleteRegion}>Șterge</button>
                  </div>
                </div>
              </>
            )}
          </Step>

          <Step n={2} title="Alege perioada" done={step2Done}>
            <div style={{ display: "grid", gap: 8 }}>
              <label className="label">Data început</label>
              <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              <label className="label">Data sfârșit</label>
              <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              {!step2Done && <small className="muted">Alege ambele date.</small>}
            </div>
          </Step>

          <Step n={3} title="Descarcă imaginile satelitare" done={step3Done}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn primary"
                onClick={startDownload}
                disabled={!step1Done || !step2Done}
                title={!step1Done || !step2Done ? "Selectează zona și datele mai întâi" : "Trimite cererea de download"}
              >
                Descarcă pereche S1
              </button>
              <button
                className="btn"
                onClick={checkDownloadHealth}
                title="Verificare conexiune Download API"
                type="button"
              >
                Verificare conexiune
              </button>
              <button
                className="btn danger"
                onClick={cancelDownload}
                disabled={!dlTaskId || /done|completed|error|failed|cancel/i.test(dlStatus || "")}
              >
                Anulează
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <div><b>Task:</b> {dlTaskId || "—"}</div>
              <div><b>Status:</b> {dlStatus || "—"}</div>
              {dlHealth && <div><b>API:</b> {dlHealth}</div>}
            </div>
          </Step>

          <Step n={4} title="Rulează analiza de inundație" done={step4Done}>
            <button
              className="btn success"
              onClick={runAnalysis}
              disabled={!step1Done || !step2Done}
              title={!step1Done || !step2Done ? "Selectează zona și datele mai întâi" : "Rulează analiza"}
            >
              Rulează analiza
            </button>

            {jobId && (
              <div style={{ marginTop: 8, fontSize: 13 }}>
                <div><b>Job:</b> {jobId}</div>
                <div><b>Status:</b> {jobInfo?.status || "în curs…"}</div>
                {jobInfo?.result && (
                  <div style={{ marginTop: 6 }}>
                    <div><b>% inundat:</b> {Number(jobInfo.result.flooded_pct).toFixed(2)}%</div>
                    <div><b>Data:</b> {new Date(jobInfo.result.post_date).toLocaleDateString()}</div>
                  </div>
                )}
              </div>
            )}
          </Step>

          {/* Advanced (ascuns pt. non-tehnici) */}
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Advanced (WKT / BBOX, import/CLI)</summary>
            <div className="section" style={{ marginTop: 8 }}>
              <label className="label">Importă zonă (BBOX sau WKT POLYGON)</label>
              <textarea
                className="textarea"
                rows={3}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="ex: 25.5,44.3,26.1,44.7  SAU  POLYGON((lng lat, ...))"
              />
              <button className="btn" style={{ marginTop: 8 }} onClick={importAOI}>Setează din text</button>
            </div>

            {region && (
              <>
                <div className="section">
                  <div className="kv">
                    <label className="label" style={{ margin: 0 }}>WKT</label>
                    <button className="copy" onClick={() => copy(region.wkt, "WKT")}>Copy</button>
                  </div>
                  <textarea className="textarea" readOnly rows={3} value={region.wkt} />
                </div>

                <div className="section">
                  <div className="kv">
                    <label className="label" style={{ margin: 0 }}>BBOX (minLng,minLat,maxLng,maxLat)</label>
                    <button className="copy" onClick={() => copy(region.bbox, "BBOX")}>Copy</button>
                  </div>
                  <input className="input" readOnly value={region.bbox} />
                </div>

                {region.type === "polygon" && (
                  <details>
                    <summary style={{ cursor: "pointer" }}>Coordonate (vertices)</summary>
                    <ul style={{ paddingLeft: 16 }}>
                      {region.coords.map((c, i) => (
                        <li key={i}>
                          {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                <div className="section">
                  <label className="label">Rulează via Python (CLI)</label>
                  <textarea
                    className="textarea"
                    readOnly
                    rows={3}
                    value={
                      !region || !start || !end
                        ? ""
                        : `python .\\main.py --username "YOUR_EMAIL" --start ${start} --end ${end} --aoi "${region.wkt}"`
                    }
                  />
                  <button
                    className="btn"
                    style={{ marginTop: 8 }}
                    onClick={() =>
                      copy(
                        `python .\\main.py --username "YOUR_EMAIL" --start ${start} --end ${end} --aoi "${region.wkt}"`,
                        "comanda CLI"
                      )
                    }
                    disabled={!region || !start || !end}
                  >
                    Copy CLI
                  </button>
                </div>
              </>
            )}
          </details>

          {status && (
            <div className="status" role="status" aria-live="polite">
              {status}
            </div>
          )}
        </aside>

        {/* Map column */}
        <div style={{ flex: 1, minHeight: 600, position: "relative" }}>
          {!region && (
            <div
              style={{
                position: "absolute",
                zIndex: 2,
                top: 10,
                left: 10,
                background: "rgba(17,24,39,.85)",
                color: "#fff",
                padding: "8px 10px",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              Sfat: folosește butonul <b>Polygon</b> sau <b>Rectangle</b> din meniu (sus, pe hartă)
            </div>
          )}

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
                  if (mapShapeRef.current) {
                    alert("Șterge zona existentă înainte de a desena una nouă.");
                    polygon.setMap(null);
                    return;
                  }
                  const path = polygon.getPath();
                  const coordsArray = [];
                  for (let i = 0; i < path.getLength(); i++) {
                    const pt = path.getAt(i);
                    coordsArray.push({ lat: pt.lat(), lng: pt.lng() });
                  }
                  const newPolygon = new window.google.maps.Polygon({
                    paths: coordsArray,
                    map: mapRef.current,
                    fillColor: "#2196F3",
                    fillOpacity: 0.3,
                    strokeColor: "#0D47A1",
                    strokeWeight: 2,
                  });
                  mapShapeRef.current = newPolygon;
                  setRegion({
                    type: "polygon",
                    coords: coordsArray,
                    wkt: polygonToWKT(coordsArray),
                    bbox: coordsToBBOX(coordsArray),
                  });
                  polygon.setMap(null);
                }}
                onRectangleComplete={(rectangle) => {
                  if (mapShapeRef.current) {
                    alert("Șterge zona existentă înainte de a desena una nouă.");
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
