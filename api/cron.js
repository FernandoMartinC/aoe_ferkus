// =============================================
// api/cron.js
// =============================================

async function kvGet(key) {
  const res  = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const json = await res.json();
  if (!json.result) return [];

  // Deserializar recursivamente
  let value = json.result;
  let attempts = 0;
  while (typeof value === "string" && attempts < 10) {
    try { value = JSON.parse(value); attempts++; } catch { break; }
  }

  // Limpiar elementos que sean strings (restos de serialización anidada)
  if (Array.isArray(value)) {
    const clean = [];
    for (const item of value) {
      if (typeof item === "object" && item !== null && item.fecha) {
        clean.push(item);
      } else if (typeof item === "string") {
        try {
          const parsed = JSON.parse(item);
          if (Array.isArray(parsed)) {
            for (const sub of parsed) {
              if (typeof sub === "object" && sub !== null && sub.fecha) clean.push(sub);
            }
          } else if (typeof parsed === "object" && parsed?.fecha) {
            clean.push(parsed);
          }
        } catch {}
      }
    }
    return clean;
  }
  return [];
}

async function kvSet(key, value) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/set/${key}`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([JSON.stringify(value)])
  });
  return res.json();
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

  const { registros, limpiar, migrar } = req.body;

  if (limpiar) {
    await kvSet("elo_history", []);
    return res.status(200).json({ ok: true, mensaje: "Base de datos limpiada" });
  }

  if (!Array.isArray(registros) || registros.length === 0) {
    return res.status(400).json({ error: "No se recibieron registros" });
  }

  let historial = await kvGet("elo_history");
  if (!Array.isArray(historial)) historial = [];

  if (migrar) {
    // Modo migración: acumular sin filtrar por fecha
    historial = [...historial, ...registros];
  } else {
    // Modo normal: reemplazar registros de hoy
    const fechaHoy = new Date().toISOString().slice(0, 10);
    historial = historial.filter(r => r.fecha !== fechaHoy);
    historial = [...historial, ...registros];
  }

  await kvSet("elo_history", historial);

  console.log(`✅ Guardados ${registros.length} registros. Total: ${historial.length}`);
  return res.status(200).json({ ok: true, registros: registros.length, total: historial.length });
}
