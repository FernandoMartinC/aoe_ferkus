// =============================================
// api/data.js
// Devuelve el historial completo al dashboard
// =============================================

async function kvGet(key) {
  const res  = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const json = await res.json();
  if (!json.result) return null;
  try { return JSON.parse(json.result); } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const historial = await kvGet("elo_history") || [];
  return res.status(200).json({ historial: Array.isArray(historial) ? historial : [] });
}
