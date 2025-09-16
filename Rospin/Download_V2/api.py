# Download_V2/api.py
from flask import Flask, request, jsonify
import os
import datetime as dt
from uuid import uuid4

app = Flask(__name__)

# ------------ Helpers -------------------------------------------------
def _iso_date(s):
    return dt.datetime.strptime(str(s)[:10], "%Y-%m-%d").date().isoformat()

def normalize_payload(data: dict):
    """
    Accepts either:
      { "aoi": {"type":"bbox"|"wkt", "value":"..."}, "start":"YYYY-MM-DD", "end":"YYYY-MM-DD" }
    or legacy:
      { "bbox":"minLon,minLat,maxLon,maxLat", "wkt":"POLYGON(...)", "start":"...", "end":"..." }
    Returns normalized dict:
      { "start": "...", "end": "...", "bbox": "..." } OR { "start": "...", "end": "...", "wkt": "..." }
    """
    aoi = data.get("aoi")
    bbox = data.get("bbox")
    wkt_str = data.get("wkt")
    start = data.get("start")
    end = data.get("end")

    # Build aoi from legacy shape if needed
    if not aoi:
        if bbox:
            aoi = {"type": "bbox", "value": str(bbox)}
        elif wkt_str:
            aoi = {"type": "wkt", "value": str(wkt_str)}

    if not aoi or not start or not end:
        raise ValueError("Missing aoi/start/end")

    aoi_type = (aoi.get("type") or "").lower()
    aoi_val = aoi.get("value")
    if aoi_type not in ("bbox", "wkt") or not aoi_val:
        raise ValueError("Invalid aoi")

    norm = {"start": _iso_date(start), "end": _iso_date(end)}
    if aoi_type == "bbox":
        parts = [p.strip() for p in str(aoi_val).split(",")]
        if len(parts) != 4:
            raise ValueError("BBOX must be 'minLon,minLat,maxLon,maxLat'")
        norm["bbox"] = ",".join(parts)
    else:
        norm["wkt"] = str(aoi_val)

    return norm

def maybe_run_pipeline(norm: dict):
    """
    Optional: actually call your downloader/pipeline if ENABLE_PIPELINE=1.
    Keep this tolerant; if import or call fails, return (None, error).
    """
    if os.environ.get("ENABLE_PIPELINE", "0") != "1":
        return None, "pipeline disabled (ENABLE_PIPELINE!=1)"

    try:
        # Example – adjust to your real module/function if needed:
        from satellite_down import run_download
        task_id = run_download(
            bbox=norm.get("bbox"),
            wkt=norm.get("wkt"),
            start=norm["start"],
            end=norm["end"],
            user=os.environ.get("COPERNICUS_USER"),
            password=os.environ.get("COPERNICUS_PASS"),
        )
        return task_id, None
    except Exception as e:
        return None, str(e)

# ------------ Routes ---------------------------------------------------
@app.get("/health")
def health():
    return jsonify(ok=True, service="download-v2")

@app.post("/download")
def download():
    # Always reply JSON (no HTML error pages)
    try:
        data = request.get_json(force=True, silent=False)
    except Exception as e:
        return jsonify(ok=False, error=f"Invalid JSON: {e}"), 400

    try:
        norm = normalize_payload(data or {})
    except Exception as e:
        return jsonify(ok=False, error=str(e), got=data), 400

    # Try pipeline (optional), otherwise just queue/echo
    task_id, pipe_err = maybe_run_pipeline(norm)
    if task_id:
        return jsonify(ok=True, queued=True, task_id=task_id, params=norm)

    # No pipeline (or failed) -> return a queued stub so the app flow works
    stub_id = f"stub-{uuid4().hex[:8]}"
    resp = {"ok": True, "queued": True, "task_id": stub_id, "params": norm}
    if pipe_err:
        resp["note"] = pipe_err
    return jsonify(resp), 200

# Backward-compat alias
@app.post("/run")
def run_alias():
    return download()

# ------------ Entrypoint ----------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("DL_API_PORT", "8010"))
    # host 0.0.0.0 so Docker/WSL can reach it
    app.run(host="0.0.0.0", port=port)

