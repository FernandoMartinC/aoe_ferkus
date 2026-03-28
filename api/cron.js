// =============================================
// api/cron.js
// Corre automáticamente cada día a las 8am UTC
// Usa la API oficial de Relic (creadores del juego)
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

// leaderboard_id: 3 = 1v1 RM, 4 = Team RM
const MODOS = [
  { id: 3, nombre: "1v1" },
  { id: 4, nombre: "TG"  }
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

// Busca el ELO de un jugador en un modo via API de Relic
async function fetchPlayerData(steamId, modo) {
  const url = `https://aoe-api.reliclink.com/community/leaderboard/GetPersonalStat?title=age2&profile_ids=[${steamId}]`;

  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "AOE2-Dashboard/1.0"
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();

  // Buscar la entrada del leaderboard correcto
  const statGroups = data?.statGroups?.[0];
  const members = statGroups?.members;
  const leaderboardStats = data?.leaderboardStats;

  if (!members || !leaderboardStats) {
    throw new Error("Formato inesperado de la API");
  }

  const nombre = members[0]?.alias || "Desconocido";

  const stat = leaderboardStats.find(s => s.leaderboard_id === modo.id);

  if (!stat) {
    return null; // jugador no rankeado en este modo
  }

  return {
    nombre,
    elo:     stat.rating,
    rank:    stat.rank,
    games:   stat.wins + stat.losses,
    winrate: stat.wins + stat.losses > 0
               ? Math.round((stat.wins / (stat.wins + stat.losses)) * 100)
               : 0,
    streak:  stat.streak,
    drops:   stat.drops ?? 0
  };
}

export default async function handler(req, res) {
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "No autorizado" });
  }

  const fechaHoy = new Date().toISOString().slice(0, 10);
  const nuevosRegistros = [];
  const errores = [];

  for (const steamId of PLAYERS) {
    try {
      // Una sola llamada por jugador (trae todos los modos)
      await sleep(500);
      const url = `https://aoe-api.reliclink.com/community/leaderboard/GetPersonalStat?title=age2&profile_ids=[${steamId}]`;

      const response = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "AOE2-Dashboard/1.0"
        }
      });

      console.log(`[${steamId}] status=${response.status}`);

      if (!response.ok) {
        errores.push({ steamId, error: `HTTP ${response.status}` });
        continue;
      }

      const data = await response.json();
      const members = data?.statGroups?.[0]?.members;
      const leaderboardStats = data?.leaderboardStats;

      if (!members || !leaderboardStats) {
        errores.push({ steamId, error: "Formato inesperado", data: JSON.stringify(data).slice(0, 200) });
        continue;
      }

      const nombre = members[0]?.alias || "Desconocido";
      console.log(`[${steamId}] nombre=${nombre}, stats encontrados=${leaderboardStats.length}`);

      for (const modo of MODOS) {
        const stat = leaderboardStats.find(s => s.leaderboard_id === modo.id);
        if (!stat) {
          console.log(`[${steamId}] sin datos para modo ${modo.nombre}`);
          continue;
        }

        const totalGames = (stat.wins || 0) + (stat.losses || 0);
        nuevosRegistros.push({
          fecha:   fechaHoy,
          steamId, nombre,
          modo:    modo.nombre,
          elo:     stat.rating    || 0,
          rank:    stat.rank      || 0,
          games:   totalGames,
          winrate: totalGames > 0 ? Math.round((stat.wins / totalGames) * 100) : 0,
          streak:  stat.streak    || 0,
          drops:   stat.drops     || 0
        });
      }

    } catch (e) {
      console.error(`Error ${steamId}:`, e.message);
      errores.push({ steamId, error: e.message });
    }
  }

  let historial = await kvGet("elo_history") || [];
  historial = historial.filter(r => r.fecha !== fechaHoy);
  historial = [...historial, ...nuevosRegistros];
  await kvSet("elo_history", historial);

  console.log(`✅ ${nuevosRegistros.length} registros guardados para ${fechaHoy}`);
  return res.status(200).json({
    ok: true,
    fecha: fechaHoy,
    registros: nuevosRegistros.length,
    errores
  });
}
