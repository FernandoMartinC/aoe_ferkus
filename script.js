let datosGlobales = [];
let datosEncabezados = [];
let chart = null;

// 🚫 Usuarios a excluir
const USUARIOS_EXCLUIDOS = ["error", "no match"];

// 📍 URL del TSV de Google Sheets
const url =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRtbgFPjJIN-U5CLK02VdIsBa3d_wxqTr7KGqqZT4q-tqBKGezw0rqKzVdHVh_o1HmvdmUHIIlW1oam/pub?gid=1528278724&single=true&output=tsv";

// 🔹 Variables de filtro de fechas
let fechaDesde = null;
let fechaHasta = null;

// -----------------------------------
// Leer y cargar dashboard
// -----------------------------------
fetch(url)
  .then((res) => res.text())
  .then((tsv) => inicializarDashboard(tsv))
  .catch((err) => console.error("Error cargando datos:", err));

function inicializarDashboard(tsv) {
  const filas = tsv.trim().split("\n");

  // 1️⃣ Encabezados
  const encabezadosOriginales = filas[0].split("\t");

  // 2️⃣ Encontrar índice de "Texto crudo"
  const indiceTextoCrudo = encabezadosOriginales.findIndex(h =>
    h.trim().replace(/^"|"$/g, "").toLowerCase() === "texto crudo"
  );

  // 3️⃣ Encabezados sin "Texto crudo"
  datosEncabezados = encabezadosOriginales.filter((_, i) => i !== indiceTextoCrudo);

  // 4️⃣ Filas
  const datos = filas.slice(1).map(f => f.split("\t"));

  // 5️⃣ Filtrar usuarios excluidos y eliminar columna "Texto crudo"
  datosGlobales = datos
    .filter(d => {
      const usuario = (d[2] || "").toLowerCase().trim();
      return !USUARIOS_EXCLUIDOS.includes(usuario);
    })
    .map(d => d.filter((_, i) => i !== indiceTextoCrudo));

  // 6️⃣ Inicializar selectores, tablas y gráfico
  cargarSelectores();
  separarYRenderizarTablas();
  actualizarGrafico();

  // 7️⃣ Filtro de fechas
  document.getElementById("filtrar-fechas").addEventListener("click", () => {
    const desdeVal = document.getElementById("fecha-desde").value;
    const hastaVal = document.getElementById("fecha-hasta").value;

    fechaDesde = desdeVal ? new Date(desdeVal) : null;
    fechaHasta = hastaVal ? new Date(hastaVal) : null;

    separarYRenderizarTablas();
    actualizarGrafico();
  });
}

// -----------------------------------
// Selectores dinámicos
// -----------------------------------
function cargarSelectores() {
  const contUsuarios = document.getElementById("checkbox-usuarios");
  const selectModo = document.getElementById("select-modo");

  const usuarios = [...new Set(datosGlobales.map((d) => d[2]))];
  const modos = [...new Set(datosGlobales.map((d) => d[3]))];

  // usuarios (checkbox)
  contUsuarios.innerHTML = "";
  usuarios.forEach((u) => {
    const label = document.createElement("label");
    label.style.marginRight = "10px";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = u;
    cb.checked = true;
    cb.addEventListener("change", actualizarGrafico);

    label.appendChild(cb);
    label.append(" " + u);
    contUsuarios.appendChild(label);
  });

  // modos (select)
  selectModo.innerHTML = "";
  modos.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    selectModo.appendChild(opt);
  });

  selectModo.addEventListener("change", actualizarGrafico);
}

// -----------------------------------
// Normalizar fechas
// -----------------------------------
function fechaSinTimezone(fechaStr) {
  const f = fechaStr.trim().replace(/^"|"$/g, "");
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
// Tablas: última fecha disponible + histórico completo
// -----------------------------------
function separarYRenderizarTablas() {
  if (!datosGlobales.length) return;

  // 🔹 Filtrar por fechas si aplica
  let datosFiltrados = [...datosGlobales];
  if (fechaDesde || fechaHasta) {
    datosFiltrados = datosFiltrados.filter(d => {
      const f = fechaSinTimezone(d[0]);
      if (fechaDesde && f < fechaDesde) return false;
      if (fechaHasta && f > fechaHasta) return false;
      return true;
    });
  }

  const todasFechas = datosFiltrados.map(d => fechaSinTimezone(d[0])).filter(f => !isNaN(f.getTime()));
  const fechaMax = todasFechas.reduce((a, b) => (a > b ? a : b), new Date(0));
  const fechaMaxStr = fechaISO(fechaMax);

  const datosUltimoDia = datosFiltrados.filter(
    d => fechaISO(fechaSinTimezone(d[0])) === fechaMaxStr
  );

  const datosHistorico = [...datosFiltrados];

  renderizarTabla(datosUltimoDia, "tabla-ayer");
  renderizarTabla(datosHistorico, "tabla-historico");
}

// -----------------------------------
// Renderizado de tablas (sin columna "Texto crudo")
// -----------------------------------
function renderizarTabla(datos, contenedorId) {
  const cont = document.getElementById(contenedorId);

  if (!datos.length) {
    cont.innerHTML = "<p>No hay datos</p>";
    return;
  }

  // 🔹 Filtrar columna "Texto crudo" al renderizar
  const encabezadosFiltrados = datosEncabezados
    .map(h => h.trim().replace(/^"|"$/g, "").toLowerCase())
    .map((h, i) => ({ h, idx: i }))
    .filter(e => e.h !== "texto crudo");

  let html = "<table border='1' cellpadding='6'><thead><tr>";
  encabezadosFiltrados.forEach(e => (html += `<th>${datosEncabezados[e.idx]}</th>`));
  html += "</tr></thead><tbody>";

  datos.forEach(fila => {
    const filaFiltrada = encabezadosFiltrados.map(e => fila[e.idx]);
    html += "<tr>";
    filaFiltrada.forEach(c => (html += `<td>${c}</td>`));
    html += "</tr>";
  });

  html += "</tbody></table>";
  cont.innerHTML = html;
}

// -----------------------------------
// Gráfico de líneas con filtro de fechas
// -----------------------------------
function actualizarGrafico() {
  const checkboxes = document.querySelectorAll("#checkbox-usuarios input[type=checkbox]");
  const usuariosSeleccionados = Array.from(checkboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value);

  if (!usuariosSeleccionados.length) return;

  const modo = document.getElementById("select-modo").value;

  const fechasSet = new Set();
  datosGlobales.forEach(d => {
    const f = fechaSinTimezone(d[0]);
    if (
      usuariosSeleccionados.includes(d[2]) &&
      d[3] === modo &&
      (!fechaDesde || f >= fechaDesde) &&
      (!fechaHasta || f <= fechaHasta)
    ) {
      fechasSet.add(fechaISO(f));
    }
  });

  const fechas = Array.from(fechasSet).sort((a, b) => new Date(a) - new Date(b));

  const datasets = usuariosSeleccionados.map((usuario, i) => {
    const mapa = {};
    datosGlobales
      .filter(d => d[2] === usuario && d[3] === modo)
      .forEach(d => {
        const f = fechaSinTimezone(d[0]);
        if ((!fechaDesde || f >= fechaDesde) && (!fechaHasta || f <= fechaHasta)) {
          mapa[fechaISO(f)] = Number(d[4]);
        }
      });

    return {
      label: usuario,
      data: fechas.map(f => ({ x: f, y: mapa[f] !== undefined ? mapa[f] : null })),
      borderColor: ['#e8b85c','#e05555','#5fafef','#7dda7d','#c47de8','#ef9d5f'][i % 6],
      tension: 0.2,
      spanGaps: true
    };
  });

  renderizarGraficoComparativo(datasets);
}

function renderizarGraficoComparativo(datasets) {
  const ctx = document.getElementById("eloChart");

  if (chart) chart.destroy();

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

// Patch: dark theme defaults for Chart.js
Chart.defaults.color = '#8a7d6a';
Chart.defaults.borderColor = '#3a2e1e';
Chart.defaults.font.family = "'Crimson Text', Georgia, serif";
