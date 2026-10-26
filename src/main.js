import { crearMesa } from "./mesa.js";
import * as G from "./generala.js";
import * as red from "./red.js";

const $ = (id) => document.getElementById(id);

const DESCRIPCION_MODO = {
  comun: "Anotás cada jugada donde quieras.",
  cantada:
    "Antes del 2.º y 3.º tiro, si apartaste al menos un dado, podés cantar de arriba o de abajo. " +
    "De abajo: después de tirar das vuelta uno de los dados que salieron del cubilete.",
  obligada: "Las jugadas se anotan en orden: Unos, Doses… hasta la Doble Generala.",
  "obligada-cantada": "En orden de Unos a Doble Generala, y con cantos de arriba o de abajo.",
};

const guardado = {
  leer(k) {
    try {
      return localStorage.getItem(`generala.${k}`);
    } catch {
      return null;
    }
  },
  escribir(k, v) {
    try {
      localStorage.setItem(`generala.${k}`, v);
    } catch {}
  },
};

const mesa = crearMesa("#dice-box");
mesa.lista.then(() => ($("cargando").hidden = true));

// --- Estado de la pantalla ---

// juego: null (en el inicio) | { tipo: "local" } | { tipo: "online", codigo, uid, sala, dejarDeEscuchar }
let juego = null;
let estado = null;   // último estado de la partida que llegó
let visto = null;    // el estado que la mesa 3D ya terminó de mostrar
let animando = false;
let mensaje = "";    // error puntual para mostrarle al jugador

function mostrar(pantalla) {
  $("inicio").hidden = pantalla !== "inicio";
  $("lobby").hidden = pantalla !== "lobby";
}

async function alCambiar(nuevo) {
  // Apartar un dado no mueve nada en la mesa: se muestra al toque, sin bloquear el siguiente click.
  if (visto && estado === visto && nuevo?.evento.n === visto.evento.n) {
    estado = visto = nuevo;
    render();
    return;
  }
  estado = nuevo;
  animando = true;
  render();
  await mesa.sincronizar(nuevo);
  if (estado === nuevo) {
    visto = nuevo;
    animando = false;
    render();
  }
}

const esMiTurno = (s) => juego?.tipo === "local" || s.actual === juego?.uid;
const puedoActuar = (s) => s && s.estado === "jugando" && esMiTurno(s) && !animando;

async function accion(fn) {
  if (!puedoActuar(estado)) return;
  mensaje = "";
  try {
    if (juego.tipo === "local") await alCambiar(fn(estado));
    else await red.jugar(juego.codigo, fn); // el cambio vuelve por escucharSala
  } catch (err) {
    mensaje = err.message;
    render();
  }
}

// --- Inicio ---

function llenarModos(select, valor) {
  select.innerHTML = Object.entries(G.MODOS)
    .map(([id, m]) => `<option value="${id}">${m.nombre}</option>`)
    .join("");
  select.value = valor;
}

function renderNombres() {
  const previos = [...$("nombres").querySelectorAll("input")].map((el) => el.value);
  const guardados = JSON.parse(guardado.leer("nombres") || "[]");
  const n = Number($("cantidad").value);
  $("nombres").innerHTML = "";
  for (let i = 0; i < n; i++) {
    const input = document.createElement("input");
    input.maxLength = 16;
    input.placeholder = `Jugador ${i + 1}`;
    input.setAttribute("aria-label", `Nombre del jugador ${i + 1}`);
    input.value = previos[i] ?? guardados[i] ?? "";
    $("nombres").appendChild(input);
  }
}

function errorInicio(texto) {
  $("inicio-error").textContent = texto;
}

function irAlInicio(aviso = "") {
  if (juego?.tipo === "online") juego.dejarDeEscuchar?.();
  juego = null;
  estado = visto = null;
  mesa.sincronizar(null);
  history.replaceState(null, "", location.pathname + (location.search.includes("emulador") ? "?emulador" : ""));
  errorInicio(aviso);
  mostrar("inicio");
  render();
}

function jugarLocal() {
  const modo = $("modo").value;
  const inputs = [...$("nombres").querySelectorAll("input")];
  const jugadores = inputs.map((el, i) => ({ id: `j${i}`, nombre: el.value.trim() || `Jugador ${i + 1}` }));
  guardado.escribir("nombres", JSON.stringify(inputs.map((el) => el.value.trim())));
  guardado.escribir("modo", modo);
  juego = { tipo: "local" };
  mostrar("juego");
  alCambiar(G.nuevaPartida({ modo, jugadores }));
}

function leerMiNombre() {
  const nombre = $("mi-nombre").value.trim();
  if (!nombre) {
    errorInicio("Escribí tu nombre para jugar online.");
    $("mi-nombre").focus();
    return null;
  }
  guardado.escribir("nombre", nombre);
  return nombre;
}

async function conBotonesOcupados(fn) {
  const botones = [$("crear-sala"), $("unirse")];
  botones.forEach((b) => (b.disabled = true));
  errorInicio("");
  try {
    await fn();
  } catch (err) {
    errorInicio(err.message);
  } finally {
    botones.forEach((b) => (b.disabled = false));
  }
}

const crearSala = () =>
  conBotonesOcupados(async () => {
    const nombre = leerMiNombre();
    if (!nombre) return;
    const modo = $("modo").value;
    guardado.escribir("modo", modo);
    const codigo = await red.crearSala({ nombre, modo });
    await entrarASala(codigo);
  });

const unirseASala = () =>
  conBotonesOcupados(async () => {
    const codigo = red.normalizarCodigo($("codigo").value);
    if (codigo.length !== 4) return errorInicio("El código tiene 4 letras.");
    const nombre = leerMiNombre();
    if (!nombre) return;
    await red.unirse(codigo, nombre);
    await entrarASala(codigo);
  });

async function entrarASala(codigo) {
  const uid = await red.entrar();
  const params = new URLSearchParams(location.search);
  params.set("sala", codigo);
  history.replaceState(null, "", `${location.pathname}?${params}`);
  juego = { tipo: "online", codigo, uid, sala: null };
  juego.dejarDeEscuchar = red.escucharSala(codigo, alCambiarSala);
}

function alCambiarSala(sala) {
  if (juego?.tipo !== "online") return;
  if (!sala || !sala.jugadores?.[juego.uid]) return irAlInicio("Saliste de la sala.");
  juego.sala = sala;
  if (sala.partida) {
    mostrar("juego");
    alCambiar(sala.partida);
  } else {
    if (estado) {
      estado = visto = null;
      mesa.sincronizar(null);
    }
    mostrar("lobby");
  }
  render();
}

// --- Sala de espera ---

const jugadoresDeSala = (sala) =>
  Object.entries(sala.jugadores || {})
    .map(([id, j]) => ({ id, ...j }))
    .sort((a, b) => (a.unido || 0) - (b.unido || 0));

function renderLobby() {
  const { sala, codigo, uid } = juego;
  const soyHost = sala.host === uid;
  const jugadores = jugadoresDeSala(sala);
  $("lobby-codigo").textContent = codigo;
  llenarModos($("lobby-modo"), sala.modo);
  $("lobby-modo").disabled = !soyHost;

  $("lobby-jugadores").innerHTML = "";
  for (const j of jugadores) {
    const li = document.createElement("li");
    if (j.online === false) li.classList.add("offline");
    const nombre = document.createElement("span");
    nombre.textContent = j.nombre;
    li.appendChild(nombre);
    const etiquetas = [j.id === uid && "vos", j.id === sala.host && "anfitrión", j.online === false && "desconectado"]
      .filter(Boolean)
      .join(" · ");
    if (etiquetas) {
      const small = document.createElement("small");
      small.textContent = etiquetas;
      li.appendChild(small);
    }
    if (soyHost && j.id !== uid) {
      const b = document.createElement("button");
      b.className = "btn-mini";
      b.textContent = "Sacar";
      b.addEventListener("click", () => red.sacarJugador(codigo, j.id).catch((e) => ($("lobby-error").textContent = e.message)));
      li.appendChild(b);
    }
    $("lobby-jugadores").appendChild(li);
  }

  $("empezar").hidden = !soyHost;
  $("empezar").disabled = jugadores.length < 2;
  $("empezar").textContent = jugadores.length < 2 ? "Esperando jugadores…" : "Empezar";
  const host = sala.jugadores?.[sala.host]?.nombre || "el anfitrión";
  $("lobby-espera").textContent = soyHost ? "" : `Esperando que ${host} empiece la partida…`;
}

async function empezarOnline() {
  const { sala, codigo } = juego;
  $("lobby-error").textContent = "";
  try {
    const jugadores = jugadoresDeSala(sala).map((j) => ({ id: j.id, nombre: j.nombre }));
    await red.empezar(codigo, G.nuevaPartida({ modo: sala.modo, jugadores }));
  } catch (err) {
    $("lobby-error").textContent = err.message;
  }
}

async function compartir() {
  const link = `${location.origin}${location.pathname}?sala=${juego.codigo}`;
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title: "La Generala", text: `Vení a jugar a la Generala. Sala ${juego.codigo}`, url: link });
    } else {
      await navigator.clipboard.writeText(link);
      $("compartir").textContent = "¡Link copiado!";
      setTimeout(() => ($("compartir").textContent = "Copiar link"), 2000);
    }
  } catch {}
}

async function salir() {
  if (juego?.tipo === "online") {
    const enPartida = !!juego.sala?.partida;
    await red.salir(juego.codigo, { borrarme: !enPartida }).catch(() => {});
  }
  irAlInicio();
}

// --- Partida ---

const nombreDe = (s, id) => s.jugadores.find((j) => j.id === id)?.nombre ?? "?";

function describir(s) {
  if (s.estado === "terminada") {
    if (s.servida) return `¡Generala servida! Gana ${nombreDe(s, s.ganadores[0])}.`;
    const max = Math.max(...s.jugadores.map((j) => G.totalPuntos(s.planillas[j.id])));
    if (s.jugadores.length === 1) return `Fin de la partida: ${max} puntos.`;
    const nombres = s.ganadores.map((id) => nombreDe(s, id));
    return nombres.length > 1
      ? `¡Empate entre ${nombres.join(" y ")} con ${max} puntos!`
      : `¡Ganó ${nombres[0]} con ${max} puntos!`;
  }
  const mio = esMiTurno(s);
  const quien = nombreDe(s, s.actual);
  if (s.voltear.length) {
    return mio
      ? "Cantaste de abajo: tocá uno de los dados que tiraste para darlo vuelta."
      : `${quien} cantó de abajo y está eligiendo qué dado dar vuelta.`;
  }
  if (s.tiro === 0) return mio ? "Tirá los dados." : `Esperando que ${quien} tire.`;

  let texto = "";
  if (s.canto === "arriba") texto = mio ? "Cantaste de arriba. " : `${quien} cantó de arriba. `;
  if (s.canto === "abajo") texto = mio ? "Diste vuelta un dado. " : `${quien} dio vuelta un dado. `;
  if (!mio) return `${texto}${quien} va por el tiro ${s.tiro} de ${G.TIROS_POR_TURNO}.`;
  if (s.tiro >= G.TIROS_POR_TURNO) return `${texto}Último tiro: elegí dónde anotar.`;
  return texto + (G.puedeCantar(s) ? "Podés cantar y volver a tirar, o anotar." : "Apartá dados y volvé a tirar, o anotá.");
}

function boton(texto, clase, alHacerClick, deshabilitado = false) {
  const b = document.createElement("button");
  b.className = clase;
  b.textContent = texto;
  b.disabled = deshabilitado;
  if (alHacerClick) b.addEventListener("click", alHacerClick);
  return b;
}

function renderBotones(s) {
  const cont = $("botones");
  cont.innerHTML = "";
  if (s.estado !== "jugando") return;
  if (animando) return cont.appendChild(boton("Rodando…", "btn-tirar", null, true));
  if (!esMiTurno(s)) return cont.appendChild(boton(`Juega ${nombreDe(s, s.actual)}…`, "btn-tirar", null, true));
  if (s.voltear.length) return;
  if (s.tiro >= G.TIROS_POR_TURNO) return cont.appendChild(boton("Sin tiros: anotá", "btn-tirar", null, true));

  const n = `(${s.tiro + 1}/${G.TIROS_POR_TURNO})`;
  if (G.puedeCantar(s)) {
    cont.appendChild(boton(`Cantar de arriba ${n}`, "btn-tirar", () => accion((e) => G.tirar(e, { canto: "arriba" }))));
    cont.appendChild(boton(`Cantar de abajo ${n}`, "btn-tirar abajo", () => accion((e) => G.tirar(e, { canto: "abajo" }))));
  } else {
    const todos = s.tiro > 0 && s.guardados.every(Boolean);
    cont.appendChild(boton(`Tirar ${n}`, "btn-tirar", () => accion((e) => G.tirar(e)), todos));
  }
}

function renderDados(s) {
  $("dados").innerHTML = "";
  const mio = puedoActuar(s);
  for (let i = 0; i < 5; i++) {
    const valor = s.tiro > 0 ? s.dados[i] : 0;
    const el = document.createElement("button");
    el.className = "dado";
    const candidato = s.voltear.includes(i);
    if (s.guardados[i] && s.tiro > 0) el.classList.add("guardado");
    if (candidato) el.classList.add("voltear");
    const puedeApartar = !s.voltear.length && s.tiro > 0 && s.tiro < G.TIROS_POR_TURNO;
    el.disabled = !mio || !(candidato || puedeApartar);
    if (valor) {
      el.dataset.valor = valor;
      for (let p = 0; p < valor; p++) el.appendChild(document.createElement("span"));
      el.setAttribute("aria-label", `Dado ${i + 1}: ${valor}${s.guardados[i] ? " (apartado)" : ""}`);
    } else {
      el.setAttribute("aria-label", `Dado ${i + 1}: sin tirar`);
    }
    el.addEventListener("click", () =>
      accion((e) => (e.voltear.length ? G.voltear(e, i) : G.alternarGuardado(e, i)))
    );
    $("dados").appendChild(el);
  }

  let ayuda = "";
  if (mio && s.voltear.length) ayuda = "Los dados que podés dar vuelta titilan.";
  else if (mio && s.tiro > 0 && s.tiro < G.TIROS_POR_TURNO) ayuda = "Tocá un dado para apartarlo (no vuelve al cubilete).";
  if (mio && G.MODOS[s.modo].obligada && s.tiro > 0) {
    const sig = G.opciones(s)[0];
    if (sig) ayuda += ` Este turno se anota en ${G.CATEGORIAS.find((c) => c.id === sig.id).nombre}.`;
  }
  $("ayuda").textContent = ayuda.trim();
}

function renderPlanilla(s) {
  const online = juego?.tipo === "online";
  const sala = online ? juego.sala : null;
  const soyHost = online && sala?.host === juego.uid;
  const activo = (i) => s.estado === "jugando" && i === s.turno;
  const esc = (t) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

  const head = document.createElement("tr");
  head.innerHTML = "<th>Jugada</th>";
  s.jugadores.forEach((j, i) => {
    const th = document.createElement("th");
    if (activo(i)) th.className = "actual";
    const desconectado = online && sala?.jugadores?.[j.id]?.online === false;
    th.innerHTML = `${desconectado ? '<span class="punto-off" title="Desconectado"></span>' : ""}${esc(j.nombre)}`;
    th.title = j.nombre;
    if (soyHost && desconectado && j.id !== juego.uid) {
      th.appendChild(
        boton("✕", "btn-mini", () => {
          if (confirm(`¿Sacar a ${j.nombre} de la partida?`)) {
            red.sacarJugador(juego.codigo, j.id, G.quitarJugador).catch((e) => {
              mensaje = e.message;
              render();
            });
          }
        })
      );
    }
    head.appendChild(th);
  });
  $("planilla-head").replaceChildren(head);

  const opciones = puedoActuar(s) ? G.opciones(s) : [];
  $("planilla").innerHTML = "";
  for (const { id, nombre } of G.CATEGORIAS) {
    const tr = document.createElement("tr");
    const td0 = document.createElement("td");
    td0.textContent = nombre;
    tr.appendChild(td0);
    s.jugadores.forEach((j, i) => {
      const td = document.createElement("td");
      if (activo(i)) td.className = "actual";
      const anotado = s.planillas[j.id]?.[id];
      const opcion = activo(i) && opciones.find((o) => o.id === id);
      if (anotado !== undefined) {
        td.classList.add("anotada");
        td.textContent = anotado === 0 ? "✕" : anotado;
      } else if (opcion) {
        td.appendChild(
          boton(
            opcion.puntos > 0 ? `+${opcion.puntos}` : "Tachar",
            opcion.puntos > 0 ? "btn-anotar" : "btn-anotar tachar",
            () => accion((e) => G.anotar(e, id))
          )
        );
      }
      tr.appendChild(td);
    });
    $("planilla").appendChild(tr);
  }

  const foot = document.createElement("tr");
  foot.innerHTML = "<th>Total</th>";
  s.jugadores.forEach((j, i) => {
    const th = document.createElement("th");
    if (activo(i)) th.className = "actual";
    th.textContent = G.totalPuntos(s.planillas[j.id]);
    foot.appendChild(th);
  });
  $("planilla-foot").replaceChildren(foot);
}

function render() {
  if (juego?.tipo === "online" && juego.sala && !juego.sala.partida) renderLobby();

  const s = visto || estado;
  const online = juego?.tipo === "online";
  $("sala-actual").hidden = !online;
  if (online) $("sala-actual").textContent = `Sala ${juego.codigo}`;

  if (!s) {
    $("modo-actual").textContent = "";
    $("turno").textContent = "";
    $("estado").textContent = "";
    $("dados").innerHTML = "";
    $("botones").innerHTML = "";
    $("ayuda").textContent = "";
    $("planilla-head").innerHTML = $("planilla").innerHTML = $("planilla-foot").innerHTML = "";
    $("fin-accion").hidden = true;
    return;
  }

  $("modo-actual").textContent = G.MODOS[s.modo].nombre;
  const mio = esMiTurno(s);
  $("turno").textContent =
    s.estado !== "jugando"
      ? "Partida terminada"
      : online && mio
        ? "¡Te toca!"
        : s.jugadores.length > 1
          ? `Turno de ${nombreDe(s, s.actual)}`
          : "";
  $("estado").textContent = mensaje || describir(s);
  $("estado").classList.toggle("error", !!mensaje);

  renderDados(s);
  renderBotones(s);
  renderPlanilla(s);

  // Al terminar: el local arranca otra; online el anfitrión vuelve a la sala para armar otra.
  const fin = $("fin-accion");
  const soyHost = online && juego.sala?.host === juego.uid;
  fin.hidden = s.estado === "jugando" || (online && !soyHost);
  fin.textContent = online ? "Volver a la sala" : "Jugar otra vez";
}

function finAccion() {
  if (juego?.tipo === "local") {
    const jugadores = estado.jugadores;
    alCambiar(G.nuevaPartida({ modo: estado.modo, jugadores }));
  } else if (juego?.tipo === "online") {
    red.volverASala(juego.codigo).catch((e) => {
      mensaje = e.message;
      render();
    });
  }
}

// --- Eventos ---

$("cantidad").addEventListener("change", renderNombres);
$("modo").addEventListener("change", () => ($("modo-desc").textContent = DESCRIPCION_MODO[$("modo").value]));
$("jugar-local").addEventListener("click", jugarLocal);
$("crear-sala").addEventListener("click", crearSala);
$("unirse").addEventListener("click", unirseASala);
$("codigo").addEventListener("input", (e) => (e.target.value = red.normalizarCodigo(e.target.value)));
$("codigo").addEventListener("keydown", (e) => e.key === "Enter" && unirseASala());
$("lobby-modo").addEventListener("change", (e) => red.cambiarModo(juego.codigo, e.target.value));
$("empezar").addEventListener("click", empezarOnline);
$("compartir").addEventListener("click", compartir);
$("lobby-salir").addEventListener("click", salir);
$("salir").addEventListener("click", salir);
$("fin-accion").addEventListener("click", finAccion);
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.target !== document.body || !estado) return;
  e.preventDefault();
  if (!G.puedeCantar(estado) && !estado.voltear.length) accion((s) => G.tirar(s));
});
red.alCambiarConexion((ok) => ($("conexion").hidden = ok || juego?.tipo !== "online"));

// --- Arranque ---

const modoInicial = G.MODOS[guardado.leer("modo")] ? guardado.leer("modo") : "comun";
llenarModos($("modo"), modoInicial);
$("modo-desc").textContent = DESCRIPCION_MODO[modoInicial];
const guardadosNombres = JSON.parse(guardado.leer("nombres") || "[]");
if (guardadosNombres.length) $("cantidad").value = String(Math.min(Math.max(guardadosNombres.length, 1), 6));
renderNombres();
$("mi-nombre").value = guardado.leer("nombre") || "";

if (!red.disponible) {
  $("bloque-online").innerHTML = '<h3>Online</h3><p class="ayuda">El modo online todavía no está configurado.</p>';
}

mostrar("inicio");
render();

// Entrando con ?sala=XXXX: si ya estabas en esa sala te vuelve a meter; si no, deja el código listo.
const codigoUrl = red.normalizarCodigo(new URLSearchParams(location.search).get("sala"));
if (codigoUrl && red.disponible) {
  $("codigo").value = codigoUrl;
  red
    .soyMiembro(codigoUrl)
    .then(async (miembro) => {
      if (!miembro) return $("mi-nombre").value ? $("unirse").focus() : $("mi-nombre").focus();
      await red.unirse(codigoUrl, guardado.leer("nombre") || "Jugador");
      await entrarASala(codigoUrl);
    })
    .catch((err) => errorInicio(err.message));
}
