import { crearMesa } from "./mesa.js";
import * as G from "./generala.js";
import * as red from "./red.js";
import * as Bot from "./bot.js";

const $ = (id) => document.getElementById(id);

const DESCRIPCION_MODO = {
  comun: "Anotás cada jugada donde quieras.",
  cantada:
    "Antes del 2.º y 3.º tiro, si apartaste al menos un dado, cantás cuántos de los dados que tirás van " +
    "de abajo y cuántos de arriba (por ejemplo, 2 y 2). Después de tirar das vuelta esa cantidad de dados.",
  obligada: "Las jugadas se anotan en orden: Unos, Doses… hasta la Doble Generala.",
  "obligada-cantada": "En orden de Unos a Doble Generala, y cantando cuántos dados van de abajo y cuántos de arriba.",
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

const NOMBRES_BOTS = ["Bot Tito", "Bot Lola", "Bot Pancho", "Bot Coca", "Bot Ramón", "Bot Chela"];

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
  // Apartar un dado solo lo lleva a la bandeja: se muestra al toque, sin bloquear el siguiente click.
  if (visto && estado === visto && nuevo?.evento.n === visto.evento.n) {
    estado = visto = nuevo;
    mesa.sincronizar(nuevo);
    render();
    programarBot();
    return;
  }
  if (nuevo?.evento.n !== estado?.evento.n) mensaje = ""; // un error viejo no queda colgado
  estado = nuevo;
  animando = true;
  render();
  await mesa.sincronizar(nuevo);
  if (estado === nuevo) {
    visto = nuevo;
    animando = false;
    render();
    programarBot();
  }
}

const esMiTurno = (s) => (juego?.tipo === "local" ? !G.esBot(s) : s.actual === juego?.uid);
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

// Hasta 6 jugadores entre personas y bots.
function renderOpcionesBots() {
  const humanos = Number($("cantidad").value);
  const previo = Number($("bots").value || guardado.leer("bots") || 0);
  const max = 6 - humanos;
  $("bots").innerHTML = Array.from({ length: max + 1 }, (_, n) => `<option value="${n}">${n === 0 ? "Sin bots" : n}</option>`).join("");
  $("bots").value = String(Math.min(previo, max));
}

function errorInicio(texto) {
  $("inicio-error").textContent = texto;
}

function irAlInicio(aviso = "") {
  if (juego?.tipo === "online") juego.dejarDeEscuchar?.();
  juego = null;
  estado = visto = null;
  mesa.sincronizar(null);
  chatVistoHasta = 0;
  $("chat").hidden = true;
  history.replaceState(null, "", location.pathname + (location.search.includes("emulador") ? "?emulador" : ""));
  errorInicio(aviso);
  mostrar("inicio");
  render();
}

function jugarLocal() {
  const modo = $("modo").value;
  const inputs = [...$("nombres").querySelectorAll("input")];
  const jugadores = inputs.map((el, i) => ({ id: `j${i}`, nombre: el.value.trim() || `Jugador ${i + 1}` }));
  const bots = Number($("bots").value);
  for (let i = 0; i < bots; i++) jugadores.push({ id: `bot-${i}`, nombre: NOMBRES_BOTS[i], bot: true });
  guardado.escribir("bots", String(bots));
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
    const etiquetas = [j.id === uid && "vos", j.id === sala.host && "anfitrión", j.bot && "bot", !j.bot && j.online === false && "desconectado"]
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

  $("agregar-bot").hidden = !soyHost || jugadores.length >= 6;
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
    const jugadores = jugadoresDeSala(sala).map((j) => ({ id: j.id, nombre: j.nombre, bot: !!j.bot }));
    await red.empezar(codigo, G.nuevaPartida({ modo: sala.modo, jugadores }));
  } catch (err) {
    $("lobby-error").textContent = err.message;
  }
}

async function agregarBotOnline() {
  const usados = new Set(jugadoresDeSala(juego.sala).map((j) => j.nombre));
  const nombre = NOMBRES_BOTS.find((n) => !usados.has(n)) || "Bot";
  try {
    await red.agregarBot(juego.codigo, nombre);
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
  const canto = s.canto && `${s.canto.abajo} de abajo y ${s.canto.arriba} de arriba`;
  if (s.voltear.length) {
    const faltan = s.porVoltear === 1 ? "1 dado" : `${s.porVoltear} dados`;
    return mio
      ? `Cantaste ${canto}: tocá ${faltan} de los que tiraste para dar vuelta.`
      : `${quien} cantó ${canto} y está eligiendo qué dados dar vuelta (falta${s.porVoltear === 1 ? "" : "n"} ${faltan}).`;
  }
  if (s.tiro === 0) return mio ? "Tirá los dados." : `Esperando que ${quien} tire.`;

  const texto = canto ? (mio ? `Cantaste ${canto}. ` : `${quien} cantó ${canto}. `) : "";
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
    // Un botón por cada forma de repartir los dados que se tiran entre abajo y arriba.
    const tirados = s.guardados.filter((g) => !g).length;
    const titulo = document.createElement("p");
    titulo.className = "cantar-titulo";
    titulo.textContent = `Cantá y tirá ${tirados === 1 ? "1 dado" : `${tirados} dados`} ${n}:`;
    cont.appendChild(titulo);
    for (let abajo = 0; abajo <= tirados; abajo++) {
      const b = boton("", `btn-tirar btn-canto${abajo ? " abajo" : ""}`, () => accion((e) => G.tirar(e, { abajo })));
      b.innerHTML = `<strong>${abajo}</strong> de abajo<br><strong>${tirados - abajo}</strong> de arriba`;
      cont.appendChild(b);
    }
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
    const desconectado = online && !j.bot && sala?.jugadores?.[j.id]?.online === false;
    th.innerHTML = `${desconectado ? '<span class="punto-off" title="Desconectado"></span>' : ""}${j.bot ? "🤖 " : ""}${esc(j.nombre)}`;
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
  renderChat();

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

// --- Bots ---
// Los bots juegan desde este dispositivo: en local siempre, online solo en el del anfitrión.
// Cada paso espera un poco para que se vea lo que hacen.

let botTimer = null;
let botPlan = null; // { clave, pasos }: lo que el bot decidió hacer en este tiro

function programarBot() {
  clearTimeout(botTimer);
  const s = visto;
  if (!s || animando || s.estado !== "jugando" || !G.esBot(s)) return;
  if (juego?.tipo === "online" && juego.sala?.host !== juego.uid) return;
  botTimer = setTimeout(pasoBot, 900);
}

async function pasoBot() {
  const s = estado;
  if (!s || s !== visto || animando || s.estado !== "jugando" || !G.esBot(s)) return;
  const clave = `${s.actual}:${s.evento.n}:${s.tiro}`;
  if (botPlan?.clave !== clave) botPlan = { clave, pasos: Bot.pasos(s, Bot.decidir(s)) };
  const paso = botPlan.pasos.shift();
  if (!paso) return (botPlan = null);
  try {
    if (juego.tipo === "local") await alCambiar(paso(s));
    else await red.jugar(juego.codigo, paso);
  } catch (err) {
    console.error("Bot:", err);
    botPlan = null;
    botTimer = setTimeout(pasoBot, 2000); // reintenta con lo que haya en la mesa
  }
}

// --- Chat ---

let chatVistoHasta = 0; // hora del último mensaje leído

function renderChat() {
  const online = juego?.tipo === "online" && !!juego.sala;
  $("chat-abrir").hidden = !online || !$("chat").hidden;
  if (!online) return;
  const mensajes = Object.values(juego.sala.chat || {})
    .sort((a, b) => (a.en || 0) - (b.en || 0))
    .slice(-50);
  const abierto = !$("chat").hidden;
  if (abierto && mensajes.length) chatVistoHasta = Math.max(chatVistoHasta, mensajes.at(-1).en || 0);
  const nuevos = mensajes.filter((m) => m.uid !== juego.uid && (m.en || 0) > chatVistoHasta).length;
  $("chat-nuevos").hidden = !nuevos;
  $("chat-nuevos").textContent = nuevos > 9 ? "9+" : String(nuevos);

  const lista = $("chat-mensajes");
  const alFondo = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 40;
  lista.innerHTML = "";
  if (!mensajes.length) {
    const li = document.createElement("li");
    li.className = "chat-vacio";
    li.textContent = "Todavía no hay mensajes.";
    lista.appendChild(li);
  }
  for (const m of mensajes) {
    const li = document.createElement("li");
    if (m.uid === juego.uid) li.className = "mio";
    const quien = document.createElement("strong");
    quien.textContent = m.nombre;
    const texto = document.createElement("span");
    texto.textContent = m.texto;
    li.append(quien, texto);
    lista.appendChild(li);
  }
  if (alFondo || abierto) lista.scrollTop = lista.scrollHeight;
}

function abrirChat(abrir) {
  $("chat").hidden = !abrir;
  renderChat();
  if (abrir) {
    $("chat-mensajes").scrollTop = $("chat-mensajes").scrollHeight;
    $("chat-texto").focus();
  }
}

async function enviarChat(e) {
  e.preventDefault();
  const texto = $("chat-texto").value.trim();
  if (!texto || juego?.tipo !== "online") return;
  const nombre = juego.sala?.jugadores?.[juego.uid]?.nombre || "?";
  $("chat-texto").value = "";
  try {
    await red.enviarMensaje(juego.codigo, nombre, texto);
  } catch (err) {
    $("chat-texto").value = texto;
    console.error("Chat:", err);
  }
}

// --- Eventos ---

$("cantidad").addEventListener("change", () => {
  renderNombres();
  renderOpcionesBots();
});
$("agregar-bot").addEventListener("click", agregarBotOnline);
$("chat-abrir").addEventListener("click", () => abrirChat(true));
$("chat-cerrar").addEventListener("click", () => abrirChat(false));
$("chat-form").addEventListener("submit", enviarChat);
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
renderOpcionesBots();
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
