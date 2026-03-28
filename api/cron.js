// =============================================
// api/cron.js
// Corre automáticamente cada día a las 8am UTC (configurado en vercel.json)
// Busca el ELO de cada jugador y lo guarda en la base de datos
// =============================================

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

const MODOS = [
  { id: 4, nombre: "TG" },
  { id: 3, nombre: "1v1" }
];

// ⏱ Esperar X milisegundos entre requests para no saturar la API
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const DELAY_MS = 1500; // 1.5 segundos entre cada request

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

export default async function handler(req, res) {
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "No autorizado" });
  }

  const fechaHoy = new Date().toISOString().slice(0, 10);
  const nuevosRegistros = [];
  const errores = [];

  for (const steamId of PLAYERS) {
    for (const modo of MODOS) {
      const url = `https://data.aoe2companion.com/api/nightbot/rank?leaderboard_id=${modo.id}&steam_id=${encodeURIComponent(steamId)}`;

      try {
        // ⏱ Esperar antes de cada request
        await sleep(DELAY_MS);

        const response = await fetch(url);
        let texto = (await response.text()).trim().replace(/^"+|"+$/g, "");

        console.log(`[${steamId}][${modo.nombre}] status=${response.status} texto="${texto.slice(0, 150)}"`);

        const match = texto.match(
          /^(?:.*?\s)?(.+?) \((\d+)\) Rank #(\d+), has played (\d+) games with a (-?\d+)% winrate, (-?\d+) streak, and (\d+) drops/
        );

        if (match) {
          const [, nombre, elo, rank, games, winrate, streak, drops] = match;
          nuevosRegistros.push({
            fecha: fechaHoy, steamId, nombre,
            modo: modo.nombre,
            elo: Number(elo), rank: Number(rank),
            games: Number(games), winrate: Number(winrate),
            streak: Number(streak), drops: Number(drops)
          });
        } else {
          console.log(`[${steamId}][${modo.nombre}] NO MATCH - texto: "${texto}"`);
          errores.push({ steamId, modo: modo.nombre, texto: texto.slice(0, 200) });
        }

      } catch (e) {
        console.error(`Error ${steamId} (${modo.nombre}):`, e.message);
        errores.push({ steamId, modo: modo.nombre, error: e.message });
      }
    }
  }

  let historial = await kvGet("elo_history") || [];
  historial = historial.filter(r => r.fecha !== fechaHoy);
  historial = [...historial, ...nuevosRegistros];
  await kvSet("elo_history", historial);

  console.log(`✅ Actualizado: ${nuevosRegistros.length} registros para ${fechaHoy}`);
  return res.status(200).json({ ok: true, fecha: fechaHoy, registros: nuevosRegistros.length, errores });
}
