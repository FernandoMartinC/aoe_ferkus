// =============================================
// script.js — Dashboard AOE2
// Lee historial desde /api/data (Vercel KV)
// Fetchea ELO fresco desde aoe2companion y lo guarda via /api/cron
// =============================================

let datosGlobales = [];
let chart = null;
let fechaDesde = null;
let fechaHasta = null;

const USUARIOS_EXCLUIDOS = ["error", "no match"];
const CRON_SECRET = "aoe2ferkus2025secreto"; // debe coincidir con variable en Vercel

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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// -----------------------------------
// Al cargar: leer historial y fetchear datos frescos si es necesario
// -----------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("filtrar-fechas").addEventListener("click", () => {
    const desdeVal = document.getElementById("fecha-desde").value;
    const hastaVal = document.getElementById("fecha-hasta").value;
    fechaDesde = desdeVal ? new Date(desdeVal) : null;
    fechaHasta = hastaVal ? new Date(hastaVal) : null;
    separarYRenderizarTablas();
    actualizarGrafico();
  });

  await cargarHistorial();
  await fetchearYGuardarSiNecesario();
});

// -----------------------------------
// Cargar historial desde Vercel KV
// -----------------------------------
async function cargarHistorial() {
  try {
    const res = await fetch("/api/data");
    const { historial } = await res.json();
    datosGlobales = (historial || []).filter(
      d => !USUARIOS_EXCLUIDOS.includes((d.nombre || "").toLowerCase().trim())
    );
    cargarSelectores();
    separarYRenderizarTablas();
    actualizarGrafico();
  } catch (err) {
    console.error("Error cargando historial:", err);
  }
}

// -----------------------------------
// Fetchear ELO fresco desde aoe2companion (desde el navegador)
// Solo corre una vez por día
// -----------------------------------
async function fetchearYGuardarSiNecesario() {
  const hoy = new Date().toISOString().slice(0, 10);
  const ultimaActualizacion = localStorage.getItem("elo_ultima_actualizacion");

  if (ultimaActualizacion === hoy) {
    console.log("✅ Datos ya actualizados hoy, no se vuelve a fetchear.");
    return;
  }

  console.log("🔄 Fetching ELO fresco desde aoe2companion...");
  mostrarBanner("Actualizando datos de ELO...", "info");

  const registros = [];
  const fechaHoy = hoy;

  for (const steamId of PLAYERS) {
    for (const modo of MODOS) {
      try {
        await sleep(1200); // delay para no saturar la API
        const url = `https://data.aoe2companion.com/api/nightbot/rank?leaderboard_id=${modo.id}&steam_id=${encodeURIComponent(steamId)}`;
        const response = await fetch(url);
        let texto = (await response.text()).trim().replace(/^"+|"+$/g, "");

        const match = texto.match(
          /^(?:.*?\s)?(.+?) \((\d+)\) Rank #(\d+), has played (\d+) games with a (-?\d+)% winrate, (-?\d+) streak, and (\d+) drops/
        );

        if (match) {
          const [, nombre, elo, rank, games, winrate, streak, drops] = match;
          registros.push({
            fecha: fechaHoy, steamId, nombre,
            modo: modo.nombre,
            elo: Number(elo), rank: Number(rank),
            games: Number(games), winrate: Number(winrate),
            streak: Number(streak), drops: Number(drops)
          });
        }
      } catch (e) {
        console.error(`Error fetching ${steamId} (${modo.nombre}):`, e.message);
      }
    }
  }

  if (registros.length === 0) {
    mostrarBanner("No se pudieron obtener datos frescos.", "error");
    return;
  }

  // Guardar en Vercel KV via /api/cron
  try {
    const saveRes = await fetch("/api/cron", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CRON_SECRET}`
      },
      body: JSON.stringify({ registros })
    });

    const result = await saveRes.json();
    if (result.ok) {
      localStorage.setItem("elo_ultima_actualizacion", hoy);
      mostrarBanner(`✅ ${result.registros} registros actualizados`, "success");
      await cargarHistorial(); // recargar el dashboard con los datos nuevos
    }
  } catch (e) {
    console.error("Error guardando datos:", e.message);
    mostrarBanner("Error al guardar los datos.", "error");
  }
}

// -----------------------------------
// Banner de estado
// -----------------------------------
function mostrarBanner(mensaje, tipo) {
  let banner = document.getElementById("status-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "status-banner";
    document.querySelector(".page-wrapper").prepend(banner);
  }
  banner.textContent = mensaje;
  banner.className = `status-banner status-${tipo}`;
  if (tipo === "success") setTimeout(() => banner.remove(), 4000);
}

// -----------------------------------
// Selectores dinámicos
// -----------------------------------
function cargarSelectores() {
  const contUsuarios = document.getElementById("checkbox-usuarios");
  const selectModo = document.getElementById("select-modo");

  const usuarios = [...new Set(datosGlobales.map(d => d.nombre))];
  const modos    = [...new Set(datosGlobales.map(d => d.modo))];

  contUsuarios.innerHTML = "";
  usuarios.forEach(u => {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = u;
    cb.checked = true;
    cb.addEventListener("change", actualizarGrafico);
    label.appendChild(cb);
    label.append(" " + u);
    contUsuarios.appendChild(label);
  });

  const modoActual = selectModo.value;
  selectModo.innerHTML = "";
  modos.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    selectModo.appendChild(opt);
  });
  if (modoActual) selectModo.value = modoActual;
  selectModo.addEventListener("change", actualizarGrafico);
}

// -----------------------------------
// Normalizar fechas
// -----------------------------------
function fechaSinTimezone(fechaStr) {
  if (!fechaStr) return new Date(NaN);
  const f = String(fechaStr).trim();
  if (f.includes("-")) {
    const [y, m, d] = f.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }
  if (f.includes("/")) {
    const [d, m, y] = f.split("/").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }
  return new Date(f);
}

function fechaISO(fecha) {
  return fecha.toISOString().slice(0, 10);
}

// -----------------------------------
// Tablas
// -----------------------------------
function separarYRenderizarTablas() {
  if (!datosGlobales.length) return;

  let datosFiltrados = [...datosGlobales];
  if (fechaDesde || fechaHasta) {
    datosFiltrados = datosFiltrados.filter(d => {
      const f = fechaSinTimezone(d.fecha);
      if (fechaDesde && f < fechaDesde) return false;
      if (fechaHasta && f > fechaHasta) return false;
      return true;
    });
  }

  const todasFechas = datosFiltrados.map(d => fechaSinTimezone(d.fecha)).filter(f => !isNaN(f));
  if (!todasFechas.length) return;

  const fechaMax = todasFechas.reduce((a, b) => (a > b ? a : b), new Date(0));
  const fechaMaxStr = fechaISO(fechaMax);

  renderizarTabla(datosFiltrados.filter(d => fechaISO(fechaSinTimezone(d.fecha)) === fechaMaxStr), "tabla-ayer");
  renderizarTabla(datosFiltrados, "tabla-historico");
}

function renderizarTabla(datos, contenedorId) {
  const cont = document.getElementById(contenedorId);
  if (!datos.length) {
    cont.innerHTML = "<p style='padding:16px;color:var(--text-muted)'>No hay datos para mostrar.</p>";
    return;
  }

  const columnas = [
    { key: "fecha",   label: "Fecha"    },
    { key: "nombre",  label: "Jugador"  },
    { key: "modo",    label: "Modo"     },
    { key: "elo",     label: "ELO"      },
    { key: "rank",    label: "Rank"     },
    { key: "games",   label: "Partidas" },
    { key: "winrate", label: "Winrate"  },
    { key: "streak",  label: "Racha"    },
    { key: "drops",   label: "Drops"    }
  ];

  let html = "<table><thead><tr>";
  columnas.forEach(c => (html += `<th>${c.label}</th>`));
  html += "</tr></thead><tbody>";

  datos.forEach(fila => {
    html += "<tr>";
    columnas.forEach(c => {
      let val = fila[c.key] ?? "-";
      if (c.key === "winrate") val = val + "%";
      if (c.key === "streak" && Number(val) > 0) val = "▲ " + val;
      if (c.key === "streak" && Number(val) < 0) val = "▼ " + val;
      html += `<td>${val}</td>`;
    });
    html += "</tr>";
  });

  html += "</tbody></table>";
  cont.innerHTML = html;
}

// -----------------------------------
// Gráfico de ELO
// -----------------------------------
function actualizarGrafico() {
  const checkboxes = document.querySelectorAll("#checkbox-usuarios input[type=checkbox]");
  const usuariosSeleccionados = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
  if (!usuariosSeleccionados.length) return;

  const modo = document.getElementById("select-modo").value;
  const colores = ["#e8b85c", "#e05555", "#5fafef", "#7dda7d", "#c47de8", "#ef9d5f", "#5fd4d4", "#e8a0c4"];

  const fechasSet = new Set();
  datosGlobales.forEach(d => {
    const f = fechaSinTimezone(d.fecha);
    if (
      usuariosSeleccionados.includes(d.nombre) && d.modo === modo &&
      (!fechaDesde || f >= fechaDesde) && (!fechaHasta || f <= fechaHasta)
    ) fechasSet.add(fechaISO(f));
  });

  const fechas = Array.from(fechasSet).sort((a, b) => new Date(a) - new Date(b));

  const datasets = usuariosSeleccionados.map((usuario, i) => {
    const mapa = {};
    datosGlobales
      .filter(d => d.nombre === usuario && d.modo === modo)
      .forEach(d => {
        const f = fechaSinTimezone(d.fecha);
        if ((!fechaDesde || f >= fechaDesde) && (!fechaHasta || f <= fechaHasta)) {
          mapa[fechaISO(f)] = d.elo;
        }
      });

    return {
      label: usuario,
      data: fechas.map(f => ({ x: f, y: mapa[f] !== undefined ? mapa[f] : null })),
      borderColor: colores[i % colores.length],
      backgroundColor: colores[i % colores.length] + "22",
      tension: 0.3,
      spanGaps: true,
      pointRadius: 3,
      pointHoverRadius: 6
    };
  });

  renderizarGrafico(datasets);
}

function renderizarGrafico(datasets) {
  const ctx = document.getElementById("eloChart");
  if (chart) chart.destroy();

  Chart.defaults.color = "#8a7d6a";
  Chart.defaults.borderColor = "#3a2e1e";
  Chart.defaults.font.family = "'Crimson Text', Georgia, serif";

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: datasets[0]?.data.map(p => p.x) || [],
      datasets
    },
    options: {
      responsive: true,
      parsing: false,
      scales: {
        x: {
          type: "category",
          title: { display: true, text: "Fecha" },
          ticks: { autoSkip: true, maxTicksLimit: 12 }
        },
        y: { title: { display: true, text: "ELO" } }
      },
      plugins: { legend: { position: "bottom" } }
    }
  });
}
