import { test } from "node:test";
import assert from "node:assert/strict";
import {
  puntaje, nuevaPartida, tirar, voltear, alternarGuardado, anotar, opciones, puedeCantar,
  quitarJugador, normalizar, CATEGORIAS,
} from "../src/generala.js";

// Azar controlado: devuelve los valores en orden.
const secuencia = (...vals) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};
const partida = (modo = "comun", n = 2) =>
  nuevaPartida({ modo, jugadores: Array.from({ length: n }, (_, i) => ({ id: `j${i}`, nombre: `J${i}` })) });

test("puntajes", () => {
  const o = { servida: false, planilla: {} };
  const s = { servida: true, planilla: {} };
  assert.equal(puntaje("escalera", [1, 2, 3, 4, 5], o), 20);
  assert.equal(puntaje("escalera", [3, 4, 5, 6, 1], s), 25);
  assert.equal(puntaje("escalera", [1, 2, 3, 4, 6], o), 0);
  assert.equal(puntaje("full", [2, 2, 3, 3, 3], o), 30);
  assert.equal(puntaje("full", [2, 2, 2, 2, 2], o), 0);
  assert.equal(puntaje("poker", [4, 4, 4, 4, 1], s), 45);
  assert.equal(puntaje("generala", [6, 6, 6, 6, 6], o), 50);
  assert.equal(puntaje("doble", [6, 6, 6, 6, 6], { servida: false, planilla: { generala: 50 } }), 100);
  assert.equal(puntaje("doble", [6, 6, 6, 6, 6], { servida: false, planilla: { generala: 0 } }), 0);
  assert.equal(puntaje("3", [3, 3, 1, 3, 2], o), 9);
});

test("turno común: tirar, apartar, volver a tirar y anotar pasa el turno", () => {
  let s = partida();
  s = tirar(s, { azar: secuencia(6, 6, 2, 3, 4) });
  assert.deepEqual(s.dados, [6, 6, 2, 3, 4]);
  s = alternarGuardado(s, 0);
  s = alternarGuardado(s, 1);
  s = tirar(s, { azar: secuencia(6, 1, 1) });
  assert.deepEqual(s.dados, [6, 6, 6, 1, 1]);
  assert.deepEqual(s.evento.slots, [2, 3, 4]);
  s = anotar(s, "full");
  assert.equal(s.planillas.j0.full, 30);
  assert.equal(s.actual, "j1");
  assert.equal(s.tiro, 0);
  assert.equal(s.evento.tipo, "limpiar");
});

test("no se puede tirar más de 3 veces", () => {
  let s = partida();
  for (let i = 0; i < 3; i++) s = tirar(s, { azar: secuencia(1, 2, 3, 4, 6) });
  assert.throws(() => tirar(s), /No te quedan tiros/);
});

test("generala servida gana la partida", () => {
  const s = tirar(partida(), { azar: secuencia(5) });
  assert.equal(s.estado, "terminada");
  assert.equal(s.servida, true);
  assert.deepEqual(s.ganadores, ["j0"]);
});

test("cantada: no se canta con los 5 dados en el cubilete", () => {
  let s = partida("cantada");
  assert.equal(puedeCantar(s), false); // antes del primer tiro
  s = tirar(s, { azar: secuencia(1, 2, 3, 4, 6) });
  assert.equal(puedeCantar(s), false); // nada apartado
  assert.throws(() => tirar(s, { canto: "abajo" }), /apartar al menos un dado/);
  s = alternarGuardado(s, 0);
  assert.equal(puedeCantar(s), true);
});

test("cantada de abajo: se da vuelta uno de los dados tirados y no consume tiro", () => {
  let s = partida("cantada");
  s = tirar(s, { azar: secuencia(6, 6, 6, 2, 3) });
  s = alternarGuardado(s, 0);
  s = alternarGuardado(s, 1);
  s = alternarGuardado(s, 2);
  s = tirar(s, { canto: "abajo", azar: secuencia(1, 5) });
  assert.deepEqual(s.voltear, [3, 4]);
  assert.equal(s.tiro, 2);
  assert.throws(() => anotar(s, "poker"), /qué dado dar vuelta/);
  assert.throws(() => tirar(s), /qué dado dar vuelta/);
  assert.throws(() => voltear(s, 0), /de los que tiraste/); // los apartados no
  s = voltear(s, 3); // 1 → 6
  assert.deepEqual(s.dados, [6, 6, 6, 6, 5]);
  assert.equal(s.tiro, 2);
  assert.equal(s.evento.tipo, "vuelta");
  // Segundo canto en el tercer tiro
  assert.equal(puedeCantar(s), true);
  s = alternarGuardado(s, 3);
  s = tirar(s, { canto: "abajo", azar: secuencia(1) });
  assert.deepEqual(s.voltear, [4]);
  s = voltear(s, 4);
  assert.deepEqual(s.dados, [6, 6, 6, 6, 6]);
  assert.equal(s.cantos, 2);
  assert.equal(puedeCantar(s), false); // no quedan tiros
  s = anotar(s, "generala");
  assert.equal(s.planillas.j0.generala, 50); // no es servida
});

test("cantada de arriba no cambia nada", () => {
  let s = partida("cantada");
  s = tirar(s, { azar: secuencia(2, 2, 2, 4, 5) });
  s = alternarGuardado(s, 0);
  s = tirar(s, { canto: "arriba", azar: secuencia(3, 3, 3, 3) });
  assert.deepEqual(s.voltear, []);
  assert.deepEqual(s.dados, [2, 3, 3, 3, 3]);
  assert.equal(s.canto, "arriba");
});

test("en la común no se canta", () => {
  let s = tirar(partida(), { azar: secuencia(1, 2, 3, 4, 6) });
  s = alternarGuardado(s, 0);
  assert.equal(puedeCantar(s), false);
  assert.throws(() => tirar(s, { canto: "abajo" }), /no se canta/);
});

test("obligada: solo se anota la siguiente jugada en orden", () => {
  let s = partida("obligada", 1);
  s = tirar(s, { azar: secuencia(3, 3, 3, 2, 2) });
  assert.deepEqual(opciones(s), [{ id: "1", puntos: 0 }]);
  assert.throws(() => anotar(s, "full"), /en orden/);
  s = anotar(s, "1");
  s = tirar(s, { azar: secuencia(2, 2, 1, 1, 3) });
  assert.deepEqual(opciones(s).map((o) => o.id), ["2"]);
});

test("la partida termina cuando todos completan la planilla", () => {
  let s = partida("obligada", 2);
  for (let turno = 0; turno < CATEGORIAS.length * 2; turno++) {
    s = tirar(s, { azar: secuencia(1, 2, 3, 4, 6) });
    s = anotar(s, opciones(s)[0].id);
  }
  assert.equal(s.estado, "terminada");
  assert.deepEqual(s.ganadores, ["j0", "j1"]); // mismo puntaje: empate
});

test("quitar al jugador de turno le pasa el turno al siguiente", () => {
  let s = partida("comun", 3);
  s = tirar(s, { azar: secuencia(1, 2, 3, 4, 6) });
  s = quitarJugador(s, "j0");
  assert.equal(s.actual, "j1");
  assert.equal(s.tiro, 0);
  assert.equal(s.planillas.j0, undefined);
});

test("normalizar repone lo que Firebase no guarda", () => {
  const guardado = JSON.parse(JSON.stringify(partida()));
  delete guardado.voltear;
  delete guardado.canto;
  guardado.planillas = { j0: [null, 3, 4] }; // así vuelve {"1": 3, "2": 4}
  const s = normalizar(guardado);
  assert.deepEqual(s.voltear, []);
  assert.equal(s.canto, "");
  assert.deepEqual(s.planillas.j0, { 1: 3, 2: 4 });
  assert.deepEqual(s.planillas.j1, {});
});
