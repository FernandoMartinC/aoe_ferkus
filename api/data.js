// =============================================
// api/data.js
// =============================================

async function kvGet(key) {
  const res  = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const json = await res.json();
  console.log("kvGet raw result:", JSON.stringify(json.result).slice(0, 100));
  if (!json.result) return [];
  try { return JSON.parse(json.result); } catch { return []; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const historial = await kvGet("elo_history");
  return res.status(200).json({ historial: Array.isArray(historial) ? historial : [] });
}
