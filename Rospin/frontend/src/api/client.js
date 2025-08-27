const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function authHeaders() {
  const t = localStorage.getItem("token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
