// Reglas de la Generala: puntajes y estado de la partida.
// Sin dependencias de UI, de los dados 3D ni de Firebase: se usa igual en el modo local y en el online.
//
// El estado es un objeto plano (se guarda tal cual en Firebase). Cada acción recibe un estado y
// devuelve uno nuevo, o tira un Error con un mensaje para mostrarle al jugador.

export const CATEGORIAS = [
  { id: "1", nombre: "Unos" },
  { id: "2", nombre: "Doses" },
  { id: "3", nombre: "Treses" },
  { id: "4", nombre: "Cuatros" },
  { id: "5", nombre: "Cincos" },
  { id: "6", nombre: "Seises" },
  { id: "escalera", nombre: "Escalera" },
  { id: "full", nombre: "Full" },
  { id: "poker", nombre: "Póker" },
  { id: "generala", nombre: "Generala" },
  { id: "doble", nombre: "Doble Generala" },
];

// cantada: antes del 2.º y 3.º tiro se canta cuántos de los dados que se tiran van "de abajo"
// y cuántos "de arriba" (por ejemplo, con 4 dados: 2 de abajo y 2 de arriba).
// obligada: las jugadas se anotan en orden, de Unos a Doble Generala.
export const MODOS = {
  comun: { nombre: "Común", cantada: false, obligada: false },
  cantada: { nombre: "Cantada", cantada: true, obligada: false },
  obligada: { nombre: "Obligada", cantada: false, obligada: true },
  "obligada-cantada": { nombre: "Obligada cantada", cantada: true, obligada: true },
};

export const TIROS_POR_TURNO = 3;

const ESCALERAS = ["12345", "23456", "13456"]; // 3-4-5-6-1 también vale

function conteos(valores) {
  const c = {};
  for (const v of valores) c[v] = (c[v] || 0) + 1;
  return Object.values(c).sort((a, b) => b - a);
}

export const esGenerala = (valores) => conteos(valores)[0] === 5;

// Puntos que daría anotar `valores` en `categoria`.
// `servida` = salió en el primer tiro (suma 5 en las jugadas mayores).
export function puntaje(categoria, valores, { servida, planilla }) {
  const extra = servida ? 5 : 0;
  const c = conteos(valores);

  if (/^[1-6]$/.test(categoria)) {
    const n = Number(categoria);
    return valores.filter((v) => v === n).length * n;
  }
  switch (categoria) {
    case "escalera": {
      const clave = [...new Set(valores)].sort().join("");
      return ESCALERAS.includes(clave) ? 20 + extra : 0;
    }
    case "full":
      return c[0] === 3 && c[1] === 2 ? 30 + extra : 0;
    case "poker":
      return c[0] >= 4 ? 40 + extra : 0;
    case "generala":
      return c[0] === 5 ? 50 : 0;
    case "doble":
      // Solo cuenta si ya se anotó una Generala (no tachada).
      return c[0] === 5 && planilla.generala > 0 ? 100 : 0;
  }
  return 0;
}

export const totalPuntos = (planilla = {}) => Object.values(planilla).reduce((a, b) => a + (b || 0), 0);
export const planillaCompleta = (planilla = {}) => CATEGORIAS.every((c) => planilla[c.id] !== undefined);

const dadoAlAzar = () => {
  const buf = new Uint32Array(1);
  // Descarta los valores del final para que los 6 números salgan con la misma probabilidad.
  do crypto.getRandomValues(buf);
  while (buf[0] >= 4294967292);
  return (buf[0] % 6) + 1;
};

const VACIO = () => ({
  tiro: 0,
  dados: [0, 0, 0, 0, 0],
  guardados: [false, false, false, false, false],
  canto: null,     // lo cantado para el último tiro: null o { abajo, arriba } (cuántos dados de cada uno)
  voltear: [],     // posiciones entre las que hay que elegir cuáles dar vuelta (si se cantó alguno de abajo)
  porVoltear: 0,   // cuántos dados quedan por dar vuelta
  cantos: 0,       // cantos hechos en el turno
});

// jugadores: [{ id, nombre, bot? }]
export function nuevaPartida({ modo = "comun", jugadores }) {
  if (!MODOS[modo]) throw new Error("Modo de juego desconocido.");
  if (!jugadores?.length) throw new Error("Hace falta al menos un jugador.");
  return {
    modo,
    jugadores: jugadores.map(({ id, nombre, bot }) => (bot ? { id, nombre, bot: true } : { id, nombre })),
    planillas: Object.fromEntries(jugadores.map((j) => [j.id, {}])),
    turno: 0,
    actual: jugadores[0].id,
    ...VACIO(),
    estado: "jugando", // "jugando" | "terminada"
    ganadores: [],
    servida: false,
    evento: { n: 0, tipo: "limpiar" }, // lo último que pasó en la mesa, para animarlo en todos los dispositivos
  };
}

// Firebase no guarda listas vacías, objetos vacíos ni strings vacíos: los reponemos al leer.
export function normalizar(s) {
  if (!s) return s;
  const v = VACIO();
  const planillas = { ...(s.planillas || {}) };
  // Una planilla con solo Unos…Seises vuelve de Firebase como lista ([null, 3, 4]): la pasamos a objeto.
  const aObjeto = (p) =>
    Array.isArray(p) ? Object.fromEntries(p.map((v, i) => [String(i), v]).filter(([, v]) => v != null)) : { ...p };
  for (const j of s.jugadores || []) planillas[j.id] = aObjeto(planillas[j.id] || {});
  return {
    ...s,
    jugadores: s.jugadores || [],
    planillas,
    tiro: s.tiro || 0,
    dados: s.dados || v.dados,
    guardados: s.guardados || v.guardados,
    // Antes el canto era "arriba" o "abajo" (un solo dado de abajo): esos se leen como sin canto.
    canto: typeof s.canto === "object" && s.canto ? { abajo: s.canto.abajo || 0, arriba: s.canto.arriba || 0 } : null,
    voltear: s.voltear || [],
    porVoltear: s.voltear?.length ? s.porVoltear || 1 : 0,
    cantos: s.cantos || 0,
    ganadores: s.ganadores || [],
    servida: !!s.servida,
    evento: { ...s.evento, slots: s.evento?.slots || [], valores: s.evento?.valores || [] },
  };
}

const clonar = (s) => JSON.parse(JSON.stringify(normalizar(s)));
const evento = (s, tipo, extra = {}) => ({ n: (s.evento?.n || 0) + 1, tipo, ...extra });

function exigirJugando(s) {
  if (s.estado !== "jugando") throw new Error("La partida terminó.");
}
function exigirSinVolteo(s) {
  if (s.voltear.length) throw new Error("Primero elegí qué dados dar vuelta.");
}

// ¿Se puede cantar antes del próximo tiro? Hace falta haber apartado al menos un dado
// (con los 5 en el cubilete no se canta, por eso el primer tiro nunca es cantado).
export function puedeCantar(s) {
  s = normalizar(s);
  if (!MODOS[s.modo].cantada || s.estado !== "jugando") return false;
  if (s.tiro === 0 || s.tiro >= TIROS_POR_TURNO || s.voltear.length) return false;
  const apartados = s.guardados.filter(Boolean).length;
  return apartados > 0 && apartados < 5;
}

// abajo: sin cantar (null) o cuántos de los dados que se tiran se cantan de abajo; el resto va de arriba.
export function tirar(estado, { abajo = null, azar = dadoAlAzar } = {}) {
  const s = clonar(estado);
  exigirJugando(s);
  exigirSinVolteo(s);
  if (s.tiro >= TIROS_POR_TURNO) throw new Error("No te quedan tiros: anotá.");
  const canta = abajo !== null;
  if (canta && !puedeCantar(s)) {
    throw new Error(
      MODOS[s.modo].cantada
        ? "Para cantar tenés que apartar al menos un dado (no pueden ir los 5 al cubilete)."
        : "En este modo no se canta."
    );
  }

  if (s.tiro === 0) s.guardados = [false, false, false, false, false];
  const slots = [0, 1, 2, 3, 4].filter((i) => !s.guardados[i]);
  if (!slots.length) throw new Error("Apartaste los 5 dados: anotá la jugada.");
  if (canta && !(Number.isInteger(abajo) && abajo >= 0 && abajo <= slots.length)) {
    throw new Error(`Hay que cantar entre 0 y ${slots.length} dados de abajo.`);
  }

  for (const i of slots) s.dados[i] = azar();
  s.tiro++;
  s.canto = canta ? { abajo, arriba: slots.length - abajo } : null;
  if (canta) s.cantos++;
  // Los cantados de abajo: el jugador elige cuáles de los dados que salieron del cubilete da vuelta.
  s.voltear = canta && abajo > 0 ? slots : [];
  s.porVoltear = s.voltear.length ? abajo : 0;
  s.evento = evento(s, "tiro", { slots, valores: slots.map((i) => s.dados[i]) });

  if (s.tiro === 1 && esGenerala(s.dados)) {
    s.estado = "terminada";
    s.servida = true;
    s.ganadores = [s.actual];
  }
  return s;
}

// Da vuelta un dado cantado de abajo: queda mostrando la cara opuesta, que suma 7 con la de arriba.
export function voltear(estado, slot) {
  const s = clonar(estado);
  exigirJugando(s);
  if (!s.voltear.length) throw new Error("No te quedan dados para dar vuelta.");
  if (!s.voltear.includes(slot)) throw new Error("Solo podés dar vuelta un dado de los que tiraste (y una sola vez).");
  const antes = s.dados[slot];
  s.dados[slot] = 7 - antes;
  s.porVoltear--;
  s.voltear = s.porVoltear > 0 ? s.voltear.filter((i) => i !== slot) : [];
  s.evento = evento(s, "vuelta", { slots: [slot], valores: [s.dados[slot]], antes });
  return s;
}

// Aparta exactamente los dados indicados (lo usan los bots para elegir todos de una).
export function fijarGuardados(estado, guardados) {
  let s = clonar(estado);
  for (let i = 0; i < 5; i++) if (s.guardados[i] !== !!guardados[i]) s = alternarGuardado(s, i);
  return s;
}

export const esBot = (estado, id = estado.actual) => !!estado.jugadores.find((j) => j.id === id)?.bot;

export function alternarGuardado(estado, slot) {
  const s = clonar(estado);
  exigirJugando(s);
  exigirSinVolteo(s);
  if (s.tiro === 0 || s.tiro >= TIROS_POR_TURNO) throw new Error("Ahora no se pueden apartar dados.");
  s.guardados[slot] = !s.guardados[slot];
  return s;
}

// Jugadas donde puede anotar el jugador actual, con los puntos que le darían.
export function opciones(estado) {
  const s = normalizar(estado);
  if (s.estado !== "jugando" || s.tiro === 0 || s.voltear.length) return [];
  const planilla = s.planillas[s.actual];
  let libres = CATEGORIAS.filter((c) => planilla[c.id] === undefined);
  if (MODOS[s.modo].obligada) libres = libres.slice(0, 1);
  return libres.map(({ id }) => ({ id, puntos: puntaje(id, s.dados, { servida: s.tiro === 1, planilla }) }));
}

export function anotar(estado, categoria) {
  const s = clonar(estado);
  exigirJugando(s);
  exigirSinVolteo(s);
  if (s.tiro === 0) throw new Error("Primero tirá los dados.");
  const opcion = opciones(s).find((o) => o.id === categoria);
  if (!opcion) {
    throw new Error(
      MODOS[s.modo].obligada ? "En la obligada hay que anotar las jugadas en orden." : "Esa jugada ya está anotada."
    );
  }
  s.planillas[s.actual][categoria] = opcion.puntos;
  return pasarTurno(s);
}

function pasarTurno(s) {
  Object.assign(s, VACIO());
  s.evento = evento(s, "limpiar");
  if (s.jugadores.every((j) => planillaCompleta(s.planillas[j.id]))) {
    s.estado = "terminada";
    const max = Math.max(...s.jugadores.map((j) => totalPuntos(s.planillas[j.id])));
    s.ganadores = s.jugadores.filter((j) => totalPuntos(s.planillas[j.id]) === max).map((j) => j.id);
    return s;
  }
  // Siguiente jugador que todavía tenga jugadas libres.
  do s.turno = (s.turno + 1) % s.jugadores.length;
  while (planillaCompleta(s.planillas[s.jugadores[s.turno].id]));
  s.actual = s.jugadores[s.turno].id;
  return s;
}

// Saca a un jugador de la partida (por ejemplo, si se desconectó y no vuelve).
export function quitarJugador(estado, id) {
  const s = clonar(estado);
  const idx = s.jugadores.findIndex((j) => j.id === id);
  if (idx < 0) return s;
  if (s.jugadores.length === 1) throw new Error("No se puede sacar al último jugador.");
  const eraSuTurno = s.actual === id;
  s.jugadores.splice(idx, 1);
  delete s.planillas[id];
  if (s.estado !== "jugando") return s;

  if (eraSuTurno) {
    // Le toca al que seguía: dejamos el índice uno antes para que pasarTurno avance hasta él.
    s.turno = (idx - 1 + s.jugadores.length) % s.jugadores.length;
    return pasarTurno(s);
  }
  if (idx < s.turno) s.turno--;
  return s;
}
