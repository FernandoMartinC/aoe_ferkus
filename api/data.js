// =============================================
// api/data.js
// =============================================

async function kvGet(key) {
  const res  = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const json = await res.json();
  if (!json.result) return [];

  // Deserializar recursivamente hasta tener un array de objetos
  let value = json.result;
  let attempts = 0;
  while (typeof value === "string" && attempts < 10) {
    try { value = JSON.parse(value); attempts++; } catch { break; }
  }

  // Si es un array, limpiar cualquier elemento que sea string (restos de serialización)
  if (Array.isArray(value)) {
    const clean = [];
    for (const item of value) {
      if (typeof item === "object" && item !== null && item.fecha) {
        clean.push(item); // es un registro válido
      } else if (typeof item === "string") {
        // puede ser un string JSON con más registros adentro
        try {
          const parsed = JSON.parse(item);
          if (Array.isArray(parsed)) {
            for (const sub of parsed) {
              if (typeof sub === "object" && sub !== null && sub.fecha) clean.push(sub);
            }
          } else if (typeof parsed === "object" && parsed.fecha) {
            clean.push(parsed);
          }
        } catch {}
      }
    }
    return clean;
  }

  return [];
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const historial = await kvGet("elo_history");
  return res.status(200).json({ historial });
}
