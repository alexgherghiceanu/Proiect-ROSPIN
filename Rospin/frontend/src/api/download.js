// frontend/src/api/download.js
const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function j(res) {
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || res.statusText);
  }
  return res.json();
}

export const downloadAPI = {
  health: () => fetch(`${BASE}/api/download/health`).then(j),

  run: (payload) =>
    fetch(`${BASE}/api/download/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(j),

  status: (taskId) =>
    fetch(`${BASE}/api/download/status/${encodeURIComponent(taskId)}`).then(j),

  cancel: (taskId) =>
    fetch(`${BASE}/api/download/cancel/${encodeURIComponent(taskId)}`, {
      method: "POST",
    }).then(j),

  list: () => fetch(`${BASE}/api/download/tasks`).then(j), // optional if your API exposes it
};
