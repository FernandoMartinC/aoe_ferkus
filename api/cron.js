// =============================================
// api/cron.js
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

async function kvSet(key, value) {
  // Upstash REST: body debe ser [value_as_string]
  const body = [JSON.stringify(value)];
  const res  = await fetch(`${process.env.KV_REST_API_URL}/set/${key}`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  console.log("kvSet response:", JSON.stringify(json));
  return json;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "No autorizado" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { registros, limpiar } = req.body;

  if (limpiar) {
    await kvSet("elo_history", []);
    return res.status(200).json({ ok: true, mensaje: "Base de datos limpiada" });
  }

  if (!Array.isArray(registros) || registros.length === 0) {
    return res.status(400).json({ error: "No se recibieron registros" });
  }

  const fechaHoy = new Date().toISOString().slice(0, 10);
  let historial  = await kvGet("elo_history");
  if (!Array.isArray(historial)) historial = [];

  historial = historial.filter(r => r.fecha !== fechaHoy);
  historial = [...historial, ...registros];

  await kvSet("elo_history", historial);

  console.log(`✅ Guardados ${registros.length} registros para ${fechaHoy}`);
  return res.status(200).json({ ok: true, fecha: fechaHoy, registros: registros.length });
}
