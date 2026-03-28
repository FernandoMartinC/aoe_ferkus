// =============================================
// api/data.js
// El dashboard llama a este endpoint para obtener todos los datos
// =============================================

async function kvGet(key) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : null;
}

export default async function handler(req, res) {
  // Permitir acceso desde el navegador
  res.setHeader("Access-Control-Allow-Origin", "*");

  const historial = await kvGet("elo_history") || [];
  return res.status(200).json({ historial });
}
