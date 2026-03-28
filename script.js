// =============================================
// script.js — Dashboard AOE2
// =============================================

let datosGlobales = [];
let chart = null;
let fechaDesde = null;
let fechaHasta = null;

const USUARIOS_EXCLUIDOS = ["error", "no match"];
const CRON_SECRET = "aoe2ferkus2025secreto";

const PLAYERS = [
  "76561198119543598","76561198798890271","76561199054279401","76561199059701504",
  "76561198068851615","76561199054287603","76561199257894752","76561199054256874"
];
const MODOS = [
  { id: 4, nombre: "TG" },
  { id: 3, nombre: "1v1" }
];
const COLORES = ["#e8b85c","#e05555","#5fafef","#7dda7d","#c47de8","#ef9d5f","#5fd4d4","#e8a0c4"];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// -----------------------------------
// Init
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
    renderizarCards();
    separarYRenderizarTablas();
    actualizarGrafico();
  } catch (err) {
    console.error("Error cargando historial:", err);
  }
}

// -----------------------------------
// Fetch ELO fresco (desde el navegador, una vez por día)
// -----------------------------------
async function fetchearYGuardarSiNecesario() {
  const hoy = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem("elo_ultima_actualizacion") === hoy) return;

  mostrarBanner("Actualizando datos de ELO...", "info");
  const registros = [];

  for (const steamId of PLAYERS) {
    for (const modo of MODOS) {
      try {
        await sleep(1200);
        const url = `https://data.aoe2companion.com/api/nightbot/rank?leaderboard_id=${modo.id}&steam_id=${encodeURIComponent(steamId)}`;
        const response = await fetch(url);
        let texto = (await response.text()).trim().replace(/^"+|"+$/g, "");
        const match = texto.match(/^(?:.*?\s)?(.+?) \((\d+)\) Rank #(\d+), has played (\d+) games with a (-?\d+)% winrate, (-?\d+) streak, and (\d+) drops/);
        if (match) {
          const [, nombre, elo, rank, games, winrate, streak, drops] = match;
          registros.push({ fecha: hoy, steamId, nombre, modo: modo.nombre,
            elo: Number(elo), rank: Number(rank), games: Number(games),
            winrate: Number(winrate), streak: Number(streak), drops: Number(drops) });
        }
      } catch (e) { console.error(`Error ${steamId} (${modo.nombre}):`, e.message); }
    }
  }

  if (!registros.length) { mostrarBanner("No se pudieron obtener datos frescos.", "error"); return; }

  try {
    const saveRes = await fetch("/api/cron", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CRON_SECRET}` },
      body: JSON.stringify({ registros })
    });
    const result = await saveRes.json();
    if (result.ok) {
      localStorage.setItem("elo_ultima_actualizacion", hoy);
      mostrarBanner(`✅ ${result.registros} registros actualizados`, "success");
      await cargarHistorial();
    }
  } catch (e) { mostrarBanner("Error al guardar los datos.", "error"); }
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
// Helpers de fecha
// -----------------------------------
function fechaSinTimezone(fechaStr) {
  if (!fechaStr) return new Date(NaN);
  const f = String(fechaStr).trim();
  if (f.includes("-")) { const [y,m,d] = f.split("-").map(Number); return new Date(y,m-1,d,12); }
  if (f.includes("/")) { const [d,m,y] = f.split("/").map(Number); return new Date(y,m-1,d,12); }
  return new Date(f);
}
function fechaISO(f) { return f.toISOString().slice(0,10); }

function getFechaMaxima() {
  const fechas = datosGlobales.map(d => fechaSinTimezone(d.fecha)).filter(f => !isNaN(f));
  if (!fechas.length) return null;
  return fechas.reduce((a,b) => a > b ? a : b, new Date(0));
}

function getUltimoElo(nombre, modo) {
  const fechaMax = getFechaMaxima();
  if (!fechaMax) return null;
  const fechaMaxStr = fechaISO(fechaMax);
  return datosGlobales.find(d => d.nombre === nombre && d.modo === modo && fechaISO(fechaSinTimezone(d.fecha)) === fechaMaxStr) || null;
}

function getEloHace7Dias(nombre, modo) {
  const fechaMax = getFechaMaxima();
  if (!fechaMax) return null;
  const hace7 = new Date(fechaMax);
  hace7.setDate(hace7.getDate() - 7);
  // buscar el registro más cercano a hace 7 días
  const registros = datosGlobales
    .filter(d => d.nombre === nombre && d.modo === modo)
    .map(d => ({ ...d, _f: fechaSinTimezone(d.fecha) }))
    .filter(d => d._f <= hace7)
    .sort((a,b) => b._f - a._f);
  return registros[0] || null;
}

function getUltimas5Partidas(nombre, modo) {
  // Ordenar por fecha desc y tomar las últimas 5 con racha positiva/negativa
  const registros = datosGlobales
    .filter(d => d.nombre === nombre && d.modo === modo)
    .map(d => ({ ...d, _f: fechaSinTimezone(d.fecha) }))
    .sort((a,b) => b._f - a._f);

  // Inferir W/L comparando ELO entre registros consecutivos
  const resultados = [];
  for (let i = 0; i < Math.min(registros.length - 1, 5); i++) {
    const actual = registros[i];
    const anterior = registros[i+1];
    if (actual.elo > anterior.elo) resultados.push("W");
    else if (actual.elo < anterior.elo) resultados.push("L");
    else resultados.push("D");
  }
  return resultados; // más reciente primero
}

function getSparklineData(nombre, modo, dias = 30) {
  const fechaMax = getFechaMaxima();
  if (!fechaMax) return [];
  const desde = new Date(fechaMax);
  desde.setDate(desde.getDate() - dias);

  return datosGlobales
    .filter(d => d.nombre === nombre && d.modo === modo)
    .map(d => ({ elo: d.elo, _f: fechaSinTimezone(d.fecha) }))
    .filter(d => d._f >= desde)
    .sort((a,b) => a._f - b._f);
}

// -----------------------------------
// CARDS de jugadores
// -----------------------------------
function renderizarCards() {
  const container = document.getElementById("cards-container");
  if (!container || !datosGlobales.length) return;

  const modo = document.getElementById("select-modo")?.value || "TG";
  const jugadores = [...new Set(datosGlobales.map(d => d.nombre))];

  // Ordenar por ELO actual desc
  const conElo = jugadores
    .map(n => ({ nombre: n, rec: getUltimoElo(n, modo) }))
    .filter(j => j.rec)
    .sort((a,b) => b.rec.elo - a.rec.elo);

  container.innerHTML = "";

  conElo.forEach((jugador, idx) => {
    const { nombre, rec } = jugador;
    const hace7 = getEloHace7Dias(nombre, modo);
    const diff = hace7 ? rec.elo - hace7.elo : null;
    const forma = getUltimas5Partidas(nombre, modo);
    const sparkData = getSparklineData(nombre, modo, 30);
    const color = COLORES[idx % COLORES.length];

    const card = document.createElement("div");
    card.className = "player-card";
    card.style.setProperty("--card-color", color);
    card.style.animationDelay = `${idx * 80}ms`;

    // Bolitas de forma W/L
    const formaBolitas = forma.map(r => {
      const cls = r === "W" ? "forma-w" : r === "L" ? "forma-l" : "forma-d";
      const title = r === "W" ? "Victoria" : r === "L" ? "Derrota" : "Empate";
      return `<span class="forma-dot ${cls}" title="${title}"></span>`;
    }).join("");

    // Sparkline SVG
    const sparkSVG = generarSparkline(sparkData, color);

    // Variación 7 días
    let diffHTML = `<span class="card-diff card-diff-neutral">— sin datos</span>`;
    if (diff !== null) {
      if (diff > 0) diffHTML = `<span class="card-diff card-diff-up">▲ +${diff} en 7 días</span>`;
      else if (diff < 0) diffHTML = `<span class="card-diff card-diff-down">▼ ${diff} en 7 días</span>`;
      else diffHTML = `<span class="card-diff card-diff-neutral">= sin cambio en 7 días</span>`;
    }

    card.innerHTML = `
      <div class="card-header">
        <span class="card-nombre">${nombre.trim()}</span>
        <span class="card-modo">${modo}</span>
      </div>
      <div class="card-elo-row">
        <span class="card-elo" data-target="${rec.elo}">0</span>
        ${diffHTML}
      </div>
      <div class="card-stats">
        <span title="Winrate">${rec.winrate}% WR</span>
        <span title="Partidas">${rec.games} 🎮</span>
        <span title="Rank">#${rec.rank.toLocaleString()}</span>
      </div>
      <div class="card-forma">
        <span class="forma-label">Forma</span>
        <div class="forma-dots">${formaBolitas || '<span style="opacity:0.4;font-size:0.8rem">sin datos</span>'}</div>
      </div>
      <div class="card-sparkline">${sparkSVG}</div>
    `;

    container.appendChild(card);
  });

  // Animar conteo de ELO
  animarConteoElo();
}

// -----------------------------------
// Sparkline SVG
// -----------------------------------
function generarSparkline(datos, color) {
  if (datos.length < 2) return '<svg width="100%" height="40"></svg>';

  const W = 200, H = 40, PAD = 4;
  const elos = datos.map(d => d.elo);
  const min = Math.min(...elos);
  const max = Math.max(...elos);
  const rango = max - min || 1;

  const puntos = datos.map((d, i) => {
    const x = PAD + (i / (datos.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (d.elo - min) / rango) * (H - PAD * 2);
    return `${x},${y}`;
  });

  const polyline = puntos.join(" ");
  const ultimo = puntos[puntos.length - 1].split(",");

  // Área bajo la curva
  const areaPoints = `${PAD},${H} ${polyline} ${W - PAD},${H}`;

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style="width:100%;height:40px">
      <defs>
        <linearGradient id="sg${color.replace('#','')}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${areaPoints}" fill="url(#sg${color.replace('#','')})" />
      <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${ultimo[0]}" cy="${ultimo[1]}" r="2.5" fill="${color}"/>
    </svg>`;
}

// -----------------------------------
// Animación de conteo de ELO
// -----------------------------------
function animarConteoElo() {
  const elementos = document.querySelectorAll(".card-elo[data-target]");
  elementos.forEach(el => {
    const target = parseInt(el.dataset.target);
    const duration = 900;
    const start = performance.now();
    const from = Math.max(0, target - 200);

    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // easing ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(from + (target - from) * eased);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  });
}

// -----------------------------------
// Selectores
// -----------------------------------
function cargarSelectores() {
  const contUsuarios = document.getElementById("checkbox-usuarios");
  const selectModo   = document.getElementById("select-modo");

  const usuarios = [...new Set(datosGlobales.map(d => d.nombre))];
  const modos    = [...new Set(datosGlobales.map(d => d.modo))];

  contUsuarios.innerHTML = "";
  usuarios.forEach(u => {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.value = u; cb.checked = true;
    cb.addEventListener("change", actualizarGrafico);
    label.appendChild(cb); label.append(" " + u.trim());
    contUsuarios.appendChild(label);
  });

  const modoActual = selectModo.value;
  selectModo.innerHTML = "";
  modos.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m; opt.textContent = m;
    selectModo.appendChild(opt);
  });
  if (modoActual) selectModo.value = modoActual;

  selectModo.addEventListener("change", () => {
    actualizarGrafico();
    renderizarCards();
  });
}

// -----------------------------------
// TABLAS
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

  const fechaMax    = todasFechas.reduce((a,b) => a > b ? a : b, new Date(0));
  const fechaMaxStr = fechaISO(fechaMax);

  // Obtener penúltima fecha para calcular variación
  const fechasUnicas = [...new Set(datosFiltrados.map(d => fechaISO(fechaSinTimezone(d.fecha))))].sort();
  const idxMax = fechasUnicas.indexOf(fechaMaxStr);
  const fechaAnterior = idxMax > 0 ? fechasUnicas[idxMax - 1] : null;

  const datosUltimoDia = datosFiltrados.filter(d => fechaISO(fechaSinTimezone(d.fecha)) === fechaMaxStr);
  const datosAyer      = fechaAnterior
    ? datosFiltrados.filter(d => fechaISO(fechaSinTimezone(d.fecha)) === fechaAnterior)
    : [];

  renderizarTablaConVariacion(datosUltimoDia, datosAyer, "tabla-ayer");
  renderizarTabla(datosFiltrados, "tabla-historico");
}

function renderizarTablaConVariacion(datosHoy, datosAyer, contenedorId) {
  const cont = document.getElementById(contenedorId);
  if (!datosHoy.length) {
    cont.innerHTML = "<p style='padding:16px;color:var(--text-muted)'>No hay datos para mostrar.</p>";
    return;
  }

  // Mapa de ELO de ayer por steamId+modo
  const eloAyer = {};
  datosAyer.forEach(d => { eloAyer[`${d.steamId}_${d.modo}`] = d.elo; });

  const columnas = [
    { key: "nombre",  label: "Jugador"  },
    { key: "modo",    label: "Modo"     },
    { key: "elo",     label: "ELO"      },
    { key: "_var",    label: "Variación"},
    { key: "rank",    label: "Rank"     },
    { key: "games",   label: "Partidas" },
    { key: "winrate", label: "Winrate"  },
    { key: "streak",  label: "Racha"    },
    { key: "drops",   label: "Drops"    }
  ];

  // Ordenar por ELO desc
  const datos = [...datosHoy].sort((a,b) => b.elo - a.elo);

  let html = "<table><thead><tr>";
  columnas.forEach(c => html += `<th>${c.label}</th>`);
  html += "</tr></thead><tbody>";

  datos.forEach(fila => {
    const key = `${fila.steamId}_${fila.modo}`;
    const eloPrev = eloAyer[key];
    const diff = eloPrev !== undefined ? fila.elo - eloPrev : null;

    html += "<tr>";
    columnas.forEach(c => {
      if (c.key === "_var") {
        if (diff === null)       html += `<td class="var-neutral">—</td>`;
        else if (diff > 0)       html += `<td class="var-up">▲ +${diff}</td>`;
        else if (diff < 0)       html += `<td class="var-down">▼ ${diff}</td>`;
        else                     html += `<td class="var-neutral">= 0</td>`;
      } else {
        let val = fila[c.key] ?? "-";
        if (c.key === "winrate") val = val + "%";
        if (c.key === "streak" && Number(val) > 0) val = `<span class="var-up">▲ ${val}</span>`;
        if (c.key === "streak" && Number(val) < 0) val = `<span class="var-down">▼ ${val}</span>`;
        if (c.key === "nombre")  val = val.trim();
        html += `<td>${val}</td>`;
      }
    });
    html += "</tr>";
  });

  html += "</tbody></table>";
  cont.innerHTML = html;
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
  columnas.forEach(c => html += `<th>${c.label}</th>`);
  html += "</tr></thead><tbody>";

  datos.forEach(fila => {
    html += "<tr>";
    columnas.forEach(c => {
      let val = fila[c.key] ?? "-";
      if (c.key === "winrate") val = val + "%";
      if (c.key === "streak" && Number(val) > 0) val = `<span class="var-up">▲ ${val}</span>`;
      if (c.key === "streak" && Number(val) < 0) val = `<span class="var-down">▼ ${val}</span>`;
      if (c.key === "nombre") val = String(val).trim();
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
  const seleccionados = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
  if (!seleccionados.length) return;

  const modo = document.getElementById("select-modo").value;

  const fechasSet = new Set();
  datosGlobales.forEach(d => {
    const f = fechaSinTimezone(d.fecha);
    if (seleccionados.includes(d.nombre) && d.modo === modo &&
        (!fechaDesde || f >= fechaDesde) && (!fechaHasta || f <= fechaHasta)) {
      fechasSet.add(fechaISO(f));
    }
  });

  const fechas = Array.from(fechasSet).sort((a,b) => new Date(a) - new Date(b));

  const datasets = seleccionados.map((usuario, i) => {
    const mapa = {};
    datosGlobales
      .filter(d => d.nombre === usuario && d.modo === modo)
      .forEach(d => {
        const f = fechaSinTimezone(d.fecha);
        if ((!fechaDesde || f >= fechaDesde) && (!fechaHasta || f <= fechaHasta))
          mapa[fechaISO(f)] = d;
      });

    return {
      label: usuario.trim(),
      data: fechas.map(f => ({ x: f, y: mapa[f]?.elo ?? null })),
      borderColor: COLORES[i % COLORES.length],
      backgroundColor: COLORES[i % COLORES.length] + "22",
      tension: 0.3, spanGaps: true, pointRadius: 3, pointHoverRadius: 6,
      _datos: mapa
    };
  });

  renderizarGrafico(datasets, fechas);
}

function renderizarGrafico(datasets, fechas) {
  const ctx = document.getElementById("eloChart");
  if (chart) chart.destroy();

  Chart.defaults.color = "#8a7d6a";
  Chart.defaults.borderColor = "#3a2e1e";
  Chart.defaults.font.family = "'Crimson Text', Georgia, serif";

  chart = new Chart(ctx, {
    type: "line",
    data: { labels: fechas, datasets },
    options: {
      responsive: true,
      parsing: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { type: "category", title: { display: true, text: "Fecha" }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
        y: { title: { display: true, text: "ELO" } }
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const dataset = ctx.dataset;
              const fecha = ctx.label;
              const dato = dataset._datos?.[fecha];
              if (!dato) return `${dataset.label}: sin datos`;
              const streak = dato.streak > 0 ? `▲${dato.streak}` : dato.streak < 0 ? `▼${dato.streak}` : "=0";
              return [
                `${dataset.label.trim()}: ${dato.elo} ELO`,
                `  Rank: #${dato.rank?.toLocaleString()}`,
                `  Winrate: ${dato.winrate}%`,
                `  Racha: ${streak}`
              ];
            }
          }
        }
      }
    }
  });
}
