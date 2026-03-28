// =============================================
// script.js — Dashboard AOE2
// Lee los datos desde /api/data (Vercel KV)
// =============================================

let datosGlobales = [];
let chart = null;
let fechaDesde = null;
let fechaHasta = null;

// 🚫 Usuarios a excluir
const USUARIOS_EXCLUIDOS = ["error", "no match"];

// -----------------------------------
// Cargar datos al iniciar
// -----------------------------------
cargarDatos();

// Auto-refresh cada 5 minutos
setInterval(cargarDatos, 5 * 60 * 1000);

async function cargarDatos() {
  try {
    mostrarCargando(true);
    const res = await fetch("/api/data");
    const { historial } = await res.json();

    // Filtrar usuarios excluidos
    datosGlobales = historial.filter(
      d => !USUARIOS_EXCLUIDOS.includes((d.nombre || "").toLowerCase().trim())
    );

    cargarSelectores();
    separarYRenderizarTablas();
    actualizarGrafico();

  } catch (err) {
    console.error("Error cargando datos:", err);
  } finally {
    mostrarCargando(false);
  }
}

function mostrarCargando(estado) {
  const el = document.getElementById("loading-indicator");
  if (el) el.style.display = estado ? "block" : "none";
}

// -----------------------------------
// Filtro de fechas
// -----------------------------------
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("filtrar-fechas").addEventListener("click", () => {
    const desdeVal = document.getElementById("fecha-desde").value;
    const hastaVal = document.getElementById("fecha-hasta").value;
    fechaDesde = desdeVal ? new Date(desdeVal) : null;
    fechaHasta = hastaVal ? new Date(hastaVal) : null;
    separarYRenderizarTablas();
    actualizarGrafico();
  });
});

// -----------------------------------
// Selectores dinámicos
// -----------------------------------
function cargarSelectores() {
  const contUsuarios = document.getElementById("checkbox-usuarios");
  const selectModo = document.getElementById("select-modo");

  const usuarios = [...new Set(datosGlobales.map(d => d.nombre))];
  const modos    = [...new Set(datosGlobales.map(d => d.modo))];

  // Checkboxes de usuarios
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

  // Select de modos
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
// Normalizar fechas (evita bugs de timezone)
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

  // Columnas a mostrar (en orden)
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
      if (c.key === "streak" && val > 0) val = "▲ " + val;
      if (c.key === "streak" && val < 0) val = "▼ " + val;
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
      usuariosSeleccionados.includes(d.nombre) &&
      d.modo === modo &&
      (!fechaDesde || f >= fechaDesde) &&
      (!fechaHasta || f <= fechaHasta)
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

  // Parche de estilo oscuro para Chart.js
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
        y: {
          title: { display: true, text: "ELO" }
        }
      },
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });
}
