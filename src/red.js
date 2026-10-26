// Todo lo que habla con Firebase: identidad anónima, presencia y datos de la sala.
//
// salas/{código}/
//   host                 uid de quien creó la sala (solo él empieza la partida y saca jugadores)
//   creada               hora de creación
//   modo                 "comun" | "cantada" | "obligada" | "obligada-cantada"
//   jugadores/{uid}      { nombre, unido, online }
//   partida              estado de generala.js; lo escribe el jugador de turno (o el host)

import { initializeApp } from "firebase/app";
import {
  getAuth, initializeAuth, inMemoryPersistence, signInAnonymously, onAuthStateChanged, connectAuthEmulator,
} from "firebase/auth";
import {
  getDatabase, ref, onValue, get, set, update, remove, runTransaction, onDisconnect, serverTimestamp,
  goOffline, goOnline, connectDatabaseEmulator,
} from "firebase/database";
import { firebaseConfig } from "./firebase-config.js";
import { normalizar } from "./generala.js";

const configurado = !firebaseConfig.apiKey.startsWith("PEGAR");
const local = ["localhost", "127.0.0.1"].includes(location.hostname);
// En la compu se puede forzar el emulador con ?emulador aunque Firebase esté configurado.
const emulador = local && (!configurado || new URLSearchParams(location.search).has("emulador"));

export const disponible = configurado || emulador;

const app = disponible
  ? initializeApp(
      emulador
        ? { apiKey: "demo", projectId: "demo-generala", databaseURL: "http://127.0.0.1:9000?ns=demo-generala-default-rtdb" }
        : firebaseConfig
    )
  : null;
// ?otro usa una identidad que no se guarda: sirve para probar con dos pestañas en el mismo navegador.
const auth =
  app &&
  (new URLSearchParams(location.search).has("otro")
    ? initializeAuth(app, { persistence: inMemoryPersistence })
    : getAuth(app));
const db = app && getDatabase(app);
if (emulador) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectDatabaseEmulator(db, "127.0.0.1", 9000);
}

// En los celulares a veces Firebase queda desconectado aunque haya internet (por ejemplo después de
// bloquear la pantalla) y tarda mucho en volver solo: si pasa un rato así, lo reconectamos a mano.
let conectado = false;
const avisosConexion = new Set();
if (db) {
  let perdidaEn = Date.now();
  onValue(ref(db, ".info/connected"), (snap) => {
    conectado = !!snap.val();
    if (!conectado) perdidaEn = Date.now();
    avisosConexion.forEach((cb) => cb(conectado));
  });
  const reconectar = (forzar) => {
    if (conectado || !navigator.onLine || (!forzar && Date.now() - perdidaEn < 8000)) return;
    perdidaEn = Date.now();
    goOffline(db);
    goOnline(db);
  };
  setInterval(reconectar, 4000);
  addEventListener("online", () => reconectar(true));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) reconectar(true);
  });
}
export const alCambiarConexion = (cb) => {
  avisosConexion.add(cb);
  return () => avisosConexion.delete(cb);
};

let uidPromesa;
export const entrar = () =>
  (uidPromesa ??= new Promise((resolve, reject) => {
    if (!auth) return reject(new Error("El modo online no está configurado (src/firebase-config.js)."));
    const parar = onAuthStateChanged(auth, (user) => {
      if (user) {
        parar();
        resolve(user.uid);
      }
    });
    signInAnonymously(auth).catch((err) => {
      parar();
      uidPromesa = null; // que el próximo intento vuelva a probar (por ejemplo, si no había internet)
      reject(err);
    });
  }));

const salaRef = (codigo, sub = "") => ref(db, `salas/${codigo}${sub ? `/${sub}` : ""}`);

const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin I ni O para no confundirlas con 1 y 0
const codigoNuevo = () =>
  Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => LETRAS[n % LETRAS.length]).join("");

export const normalizarCodigo = (texto) => (texto || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);

const esRechazo = (err) => /permission[_ ]denied/i.test(`${err?.code || ""} ${err?.message || ""}`);

export async function crearSala({ nombre, modo }) {
  const uid = await entrar();
  for (let intento = 0; intento < 5; intento++) {
    const codigo = codigoNuevo();
    try {
      // Si el código ya existe, las reglas rechazan escribir `host` y probamos con otro.
      await update(salaRef(codigo), {
        host: uid,
        creada: serverTimestamp(),
        modo,
        [`jugadores/${uid}`]: { nombre, unido: serverTimestamp(), online: true },
      });
      await marcarPresencia(codigo, uid);
      return codigo;
    } catch (err) {
      if (!esRechazo(err)) throw err;
    }
  }
  throw new Error("No se pudo crear la sala. Probá de nuevo.");
}

export async function soyMiembro(codigo) {
  const uid = await entrar();
  return (await get(salaRef(codigo, `jugadores/${uid}`))).exists();
}

export async function unirse(codigo, nombre) {
  const uid = await entrar();
  const snap = await get(salaRef(codigo));
  if (!snap.exists()) throw new Error(`No existe la sala ${codigo}.`);
  const sala = snap.val();
  const yaEstaba = !!sala.jugadores?.[uid];
  const enPartida = !!sala.partida?.jugadores?.some((j) => j.id === uid);
  if (sala.partida && !enPartida) throw new Error("Esa partida ya empezó.");
  if (!yaEstaba && Object.keys(sala.jugadores || {}).length >= 6) throw new Error("La sala está llena (6 jugadores).");
  await set(salaRef(codigo, `jugadores/${uid}`), {
    nombre: yaEstaba ? sala.jugadores[uid].nombre : nombre,
    unido: yaEstaba ? sala.jugadores[uid].unido : serverTimestamp(),
    online: true,
  });
  await marcarPresencia(codigo, uid);
}

// `online` pasa a false solo cuando se corta la conexión, y vuelve a true al reconectar.
const presencias = new Map();
async function marcarPresencia(codigo, uid) {
  const onlineRef = salaRef(codigo, `jugadores/${uid}/online`);
  await onDisconnect(onlineRef).set(false);
  presencias.get(codigo)?.();
  presencias.set(
    codigo,
    alCambiarConexion(async (ok) => {
      if (!ok) return;
      const snap = await get(salaRef(codigo, `jugadores/${uid}`));
      if (!snap.exists()) return; // lo sacaron de la sala
      await onDisconnect(onlineRef).set(false);
      await set(onlineRef, true);
    })
  );
}

export async function salir(codigo, { borrarme }) {
  const uid = await entrar();
  presencias.get(codigo)?.();
  presencias.delete(codigo);
  const yo = salaRef(codigo, `jugadores/${uid}`);
  await onDisconnect(salaRef(codigo, `jugadores/${uid}/online`)).cancel();
  if (borrarme) await remove(yo);
  else await set(salaRef(codigo, `jugadores/${uid}/online`), false);
}

export function escucharSala(codigo, cb) {
  return onValue(salaRef(codigo), (snap) => {
    const sala = snap.val();
    if (sala?.partida) sala.partida = normalizar(sala.partida);
    cb(sala);
  });
}

export const cambiarModo = (codigo, modo) => set(salaRef(codigo, "modo"), modo);
export const empezar = (codigo, partida) => set(salaRef(codigo, "partida"), partida);
export const volverASala = (codigo) => remove(salaRef(codigo, "partida"));

export async function sacarJugador(codigo, uid, quitarDePartida) {
  if (quitarDePartida) await jugar(codigo, (s) => quitarDePartida(s, uid));
  await remove(salaRef(codigo, `jugadores/${uid}`));
}

// Aplica una acción de generala.js sobre la partida guardada. La transacción evita pisar
// una jugada que llegó mientras tanto.
export async function jugar(codigo, accion) {
  let error = null;
  const r = await runTransaction(
    salaRef(codigo, "partida"),
    (actual) => {
      if (!actual) return actual; // todavía no la tenemos: Firebase vuelve a llamar con el dato real
      try {
        error = null;
        return accion(normalizar(actual));
      } catch (err) {
        error = err;
        return undefined; // cancela la transacción
      }
    },
    { applyLocally: false }
  );
  if (error) throw error;
  if (!r.committed) throw new Error("No se pudo guardar la jugada. Probá de nuevo.");
  return normalizar(r.snapshot.val());
}
