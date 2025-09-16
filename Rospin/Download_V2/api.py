# Rospin/Download_V2/api.py
from flask import Flask, request, jsonify
import os, subprocess, json, shlex, pathlib

ROOT = pathlib.Path(__file__).parent

app = Flask(__name__)

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/download")
def download():
    """
    Așteaptă JSON:
    {
      "aoi": "BBOX sau WKT",   # ideal BBOX "minLng,minLat,maxLng,maxLat"
      "start": "YYYY-MM-DD",
      "end":   "YYYY-MM-DD",
      "out_dir": "/app/data"   # opțional
    }
    """
    data = request.get_json(force=True)
    aoi   = data.get("aoi")
    start = data.get("start")
    end   = data.get("end")
    out_dir = data.get("out_dir", "/app/data")

    if not aoi or not start or not end:
        return jsonify({"ok": False, "error": "Missing aoi/start/end"}), 400

    user = os.getenv("COPERNICUS_USER")
    pwd  = os.getenv("COPERNICUS_PASS")

    # Construim comanda pentru CLI-ul tău existent (main.py)
    # Nu forțez parola ca argument (dacă CLI-ul nu o cere),
    # o lăsăm în env; dacă main.py vrea obligatoriu --username, îl dăm.
    cmd = ["python", "main.py", "--start", start, "--end", end, "--aoi", aoi]
    if user:
        cmd += ["--username", user]

    env = os.environ.copy()
    if user: env["COPERNICUS_USER"] = user
    if pwd:  env["COPERNICUS_PASS"] = pwd

    # rulează în directorul Download_V2
    p = subprocess.run(
        cmd, cwd=str(ROOT), env=env,
        capture_output=True, text=True
    )

    payload = {
        "ok": p.returncode == 0,
        "stdout": p.stdout[-8000:],  # trimitem doar ultimele linii, să nu dăm dump uriaș
        "stderr": p.stderr[-8000:],
        "out_dir": out_dir
    }

    # Dacă main.py printează JSON, încercăm să-l parsam
    try:
        payload_json = json.loads(p.stdout)
        payload["result"] = payload_json
    except Exception:
        pass

    return (jsonify(payload), 200 if payload["ok"] else 500)


if __name__ == "__main__":
    port = int(os.getenv("DL_API_PORT", "8010"))
    app.run(host="0.0.0.0", port=port)
