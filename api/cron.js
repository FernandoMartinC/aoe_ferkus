// =============================================
// api/cron.js
// Recibe los datos desde el navegador y los guarda en Vercel KV
// =============================================

async function kvGet(key) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const data = await res.json();
  if (!data.result) return null;

  // Deserializar recursivamente
  let value = data.result;
  while (typeof value === "string") {
    try { value = JSON.parse(value); } catch { break; }
  }
  return value;
}

async function kvSet(key, value) {
  // Guardar como string JSON simple (sin anidar)
  await fetch(`${process.env.KV_REST_API_URL}/set/${key}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([JSON.stringify(value)])
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "No autorizado" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { registros } = req.body;
  if (!registros || !Array.isArray(registros) || registros.length === 0) {
    return res.status(400).json({ error: "No se recibieron registros" });
  }

  const fechaHoy = new Date().toISOString().slice(0, 10);

  // Limpiar historial existente del día y agregar los nuevos
  let historial = await kvGet("elo_history") || [];
  if (!Array.isArray(historial)) historial = [];
  historial = historial.filter(r => r.fecha !== fechaHoy);
  historial = [...historial, ...registros];

  await kvSet("elo_history", historial);

  console.log(`✅ Guardados ${registros.length} registros para ${fechaHoy}`);
  return res.status(200).json({ ok: true, fecha: fechaHoy, registros: registros.length });
}
