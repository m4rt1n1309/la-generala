import DiceBox from "@3d-dice/dice-box";
import { CATEGORIAS, puntaje, esGenerala } from "./generala.js";

const TIROS_POR_TURNO = 3;
const MAX_JUGADORES = 6;

const $ = (id) => document.getElementById(id);
const ui = {
  dados: $("dados"),
  tirar: $("tirar"),
  turno: $("turno"),
  estado: $("estado"),
  head: $("planilla-head"),
  planilla: $("planilla"),
  foot: $("planilla-foot"),
  nueva: $("nueva"),
  cargando: $("cargando"),
  config: $("config"),
  configForm: $("config-form"),
  cantidad: $("cantidad"),
  nombres: $("nombres"),
};

const box = new DiceBox({
  container: "#dice-box",
  assetPath: "/assets/dice-box/",
  // "smooth-pip" extiende "smooth" y agrega el dado "pip" (d6 con puntos).
  theme: "smooth-pip",
  themeColor: "#f3eee3",
  scale: 6,
  delay: 40,
});

// Estado del juego
let jugadores = [];        // [{ nombre, planilla: { categoria: puntos } }]
let actual = 0;            // índice del jugador que está tirando
let dados = [];            // objetos de dado que devuelve dice-box ({ value, rollId, ... })
let guardados = new Set(); // índices (0-4) de dados guardados
let tiro = 0;              // tiros hechos en el turno actual
let rodando = false;
let terminado = false;
let boxListo = false;

const jugador = () => jugadores[actual];
const totalPuntos = (j) => Object.values(j.planilla).reduce((a, b) => a + (b || 0), 0);
const completo = (j) => CATEGORIAS.every((c) => j.planilla[c.id] !== undefined);

async function tirar() {
  if (!boxListo || rodando || tiro >= TIROS_POR_TURNO || terminado) return;
  rodando = true;
  render();

  if (tiro === 0) {
    dados = await box.roll("5dpip");
  } else {
    const libres = dados
      .map((d, i) => ({ d, i }))
      .filter(({ i }) => !guardados.has(i));
    // reroll saca esos dados de la mesa y tira nuevos; los guardados quedan quietos.
    const nuevos = await box.reroll(libres.map(({ d }) => d), { remove: true });
    libres.forEach(({ i }, k) => (dados[i] = nuevos[k]));
  }

  tiro++;
  rodando = false;

  const valores = dados.map((d) => d.value);
  if (tiro === 1 && esGenerala(valores)) {
    terminado = true;
    ui.estado.textContent = `¡Generala servida! ${jugador().nombre} gana la partida.`;
  } else {
    ui.estado.textContent =
      tiro < TIROS_POR_TURNO
        ? "Guardá los dados que quieras y volvé a tirar, o anotá."
        : "Último tiro: elegí dónde anotar.";
  }
  render();
}

function anotar(categoria) {
  const { planilla } = jugador();
  if (tiro === 0 || rodando || terminado || planilla[categoria] !== undefined) return;
  const valores = dados.map((d) => d.value);
  planilla[categoria] = puntaje(categoria, valores, { servida: tiro === 1, planilla });

  tiro = 0;
  guardados = new Set();
  dados = [];
  box.clear();

  if (jugadores.every(completo)) {
    terminado = true;
    ui.estado.textContent = resultadoFinal();
  } else {
    actual = (actual + 1) % jugadores.length;
    ui.estado.textContent = jugadores.length > 1 ? "Pasale la compu y tirá." : "Nuevo turno. Tirá los dados.";
  }
  render();
}

function resultadoFinal() {
  const max = Math.max(...jugadores.map(totalPuntos));
  const ganadores = jugadores.filter((j) => totalPuntos(j) === max).map((j) => j.nombre);
  if (jugadores.length === 1) return `Fin de la partida: ${max} puntos.`;
  if (ganadores.length > 1) return `¡Empate entre ${ganadores.join(" y ")} con ${max} puntos!`;
  return `¡Ganó ${ganadores[0]} con ${max} puntos!`;
}

function toggleGuardado(i) {
  if (tiro === 0 || tiro >= TIROS_POR_TURNO || rodando || terminado) return;
  guardados.has(i) ? guardados.delete(i) : guardados.add(i);
  render();
}

// --- Configuración de la partida ---

function renderNombres() {
  const previos = [...ui.nombres.querySelectorAll("input")].map((el) => el.value);
  const n = Number(ui.cantidad.value);
  ui.nombres.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const label = document.createElement("label");
    label.className = "campo";
    label.textContent = `Jugador ${i + 1}`;
    const input = document.createElement("input");
    input.maxLength = 16;
    input.placeholder = `Jugador ${i + 1}`;
    input.value = previos[i] ?? jugadores[i]?.nombre ?? "";
    label.appendChild(input);
    ui.nombres.appendChild(label);
  }
}

function abrirConfig() {
  if (rodando) return;
  if (jugadores.length) ui.cantidad.value = String(Math.min(jugadores.length, MAX_JUGADORES));
  ui.nombres.innerHTML = "";
  renderNombres();
  ui.config.showModal();
}

function empezarPartida() {
  jugadores = [...ui.nombres.querySelectorAll("input")].map((el, i) => ({
    nombre: el.value.trim() || `Jugador ${i + 1}`,
    planilla: {},
  }));
  actual = 0;
  tiro = 0;
  guardados = new Set();
  dados = [];
  terminado = false;
  if (boxListo) box.clear();
  ui.estado.textContent = "Tirá los dados para empezar.";
  render();
}

// --- Render ---

function render() {
  if (!jugadores.length) return;

  ui.turno.textContent = terminado
    ? "Partida terminada"
    : jugadores.length > 1
      ? `Turno de ${jugador().nombre}`
      : "";

  // Dados
  ui.dados.innerHTML = "";
  for (let i = 0; i < 5; i++) {
    const valor = dados[i]?.value;
    const el = document.createElement("button");
    el.className = "dado";
    el.disabled = !valor || rodando || terminado || tiro >= TIROS_POR_TURNO;
    if (guardados.has(i)) el.classList.add("guardado");
    if (valor) {
      el.dataset.valor = valor;
      el.setAttribute("aria-label", `Dado ${i + 1}: ${valor}${guardados.has(i) ? " (guardado)" : ""}`);
      for (let p = 0; p < valor; p++) el.appendChild(document.createElement("span"));
    } else {
      el.setAttribute("aria-label", `Dado ${i + 1}: sin tirar`);
    }
    el.addEventListener("click", () => toggleGuardado(i));
    ui.dados.appendChild(el);
  }

  // Botón tirar
  const quedan = tiro < TIROS_POR_TURNO && !terminado;
  ui.tirar.disabled = !boxListo || rodando || !quedan;
  ui.tirar.textContent = rodando
    ? "Rodando…"
    : quedan
      ? `Tirar (${tiro + 1}/${TIROS_POR_TURNO})`
      : terminado ? "Partida terminada" : "Sin tiros: anotá";

  // Planilla: una columna por jugador
  const claseCol = (i) => (i === actual && !terminado ? ' class="actual"' : "");
  const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  ui.head.innerHTML = `<tr><th>Jugada</th>${jugadores
    .map((j, i) => `<th${claseCol(i)}>${esc(j.nombre)}</th>`)
    .join("")}</tr>`;
  ui.foot.innerHTML = `<tr><th>Total</th>${jugadores
    .map((j, i) => `<th${claseCol(i)}>${totalPuntos(j)}</th>`)
    .join("")}</tr>`;

  const valores = dados.map((d) => d.value);
  ui.planilla.innerHTML = "";
  for (const { id, nombre } of CATEGORIAS) {
    const tr = document.createElement("tr");
    const th = document.createElement("td");
    th.textContent = nombre;
    tr.appendChild(th);

    jugadores.forEach((j, i) => {
      const td = document.createElement("td");
      if (i === actual && !terminado) td.className = "actual";
      const anotado = j.planilla[id];

      if (anotado !== undefined) {
        td.classList.add("anotada");
        td.textContent = anotado === 0 ? "✕" : anotado;
      } else if (i === actual && tiro > 0 && !rodando && !terminado) {
        const pts = puntaje(id, valores, { servida: tiro === 1, planilla: j.planilla });
        const btn = document.createElement("button");
        btn.className = pts > 0 ? "btn-anotar" : "btn-anotar tachar";
        btn.textContent = pts > 0 ? `+${pts}` : "Tachar";
        btn.addEventListener("click", () => anotar(id));
        td.appendChild(btn);
      }
      tr.appendChild(td);
    });
    ui.planilla.appendChild(tr);
  }
}

ui.tirar.addEventListener("click", tirar);
ui.nueva.addEventListener("click", abrirConfig);
ui.cantidad.addEventListener("change", renderNombres);
ui.configForm.addEventListener("submit", empezarPartida);
// Sin partida configurada no se puede cerrar el diálogo con Escape.
ui.config.addEventListener("cancel", (e) => {
  if (!jugadores.length) e.preventDefault();
});
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && e.target === document.body) {
    e.preventDefault();
    tirar();
  }
});

abrirConfig();
box.init().then(() => {
  boxListo = true;
  ui.cargando.hidden = true;
  render();
});
