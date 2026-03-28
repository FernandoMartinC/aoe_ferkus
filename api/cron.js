// =============================================
// api/cron.js
// Corre automáticamente cada hora (configurado en vercel.json)
// Busca el ELO de cada jugador y lo guarda en la base de datos
// =============================================

// 👥 Steam IDs de los jugadores
const PLAYERS = [
  "76561198119543598",
  "76561198798890271",
  "76561199054279401",
  "76561199059701504",
  "76561198068851615",
  "76561199054287603",
  "76561199257894752",
  "76561199054256874"
];

// 🎮 Modos de juego
const MODOS = [
  { id: 4, nombre: "TG" },
  { id: 3, nombre: "1v1" }
];

// -----------------------------------
// Helpers para leer/escribir en la base de datos (Vercel KV)
// -----------------------------------
async function kvGet(key) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : null;
}

async function kvSet(key, value) {
  await fetch(`${process.env.KV_REST_API_URL}/set/${key}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([JSON.stringify(value)])
  });
}

// -----------------------------------
// Función principal
// -----------------------------------
export default async function handler(req, res) {

  // Seguridad: solo Vercel puede llamar a este endpoint
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "No autorizado" });
  }

  const fechaHoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const nuevosRegistros = [];

  // 🔄 Buscar ELO de cada jugador en cada modo
  for (const steamId of PLAYERS) {
    for (const modo of MODOS) {
      const url = `https://data.aoe2companion.com/api/nightbot/rank?leaderboard_id=${modo.id}&steam_id=${encodeURIComponent(steamId)}`;
      
      try {
        const response = await fetch(url);
        let texto = (await response.text()).trim().replace(/^"+|"+$/g, "");

        // Parsear el texto de la API
        const match = texto.match(
          /^(?:.*?\s)?(.+?) \((\d+)\) Rank #(\d+), has played (\d+) games with a (-?\d+)% winrate, (-?\d+) streak, and (\d+) drops/
        );

        if (match) {
          const [, nombre, elo, rank, games, winrate, streak, drops] = match;
          nuevosRegistros.push({
            fecha:   fechaHoy,
            steamId, nombre,
            modo:    modo.nombre,
            elo:     Number(elo),
            rank:    Number(rank),
            games:   Number(games),
            winrate: Number(winrate),
            streak:  Number(streak),
            drops:   Number(drops)
          });
        }

      } catch (e) {
        console.error(`Error fetching ${steamId} (${modo.nombre}):`, e.message);
      }
    }
  }

  // 📦 Cargar historial existente
  let historial = await kvGet("elo_history") || [];

  // Reemplazar entradas de hoy con los datos frescos
  historial = historial.filter(r => r.fecha !== fechaHoy);
  historial = [...historial, ...nuevosRegistros];

  // 💾 Guardar historial actualizado
  await kvSet("elo_history", historial);

  console.log(`✅ Actualizado: ${nuevosRegistros.length} registros para ${fechaHoy}`);
  return res.status(200).json({ ok: true, fecha: fechaHoy, registros: nuevosRegistros.length });
}
