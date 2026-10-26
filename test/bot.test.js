import { test } from "node:test";
import assert from "node:assert/strict";
import { decidir, pasos } from "../src/bot.js";
import { nuevaPartida, tirar, MODOS, totalPuntos } from "../src/generala.js";

const secuencia = (...vals) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};
const conBot = (modo = "comun") => nuevaPartida({ modo, jugadores: [{ id: "b", nombre: "Bot", bot: true }] });

// Juega toda la partida solo con el bot; devuelve el estado final.
function jugarPartida(modo) {
  let s = conBot(modo);
  for (let n = 0; n < 500 && s.estado === "jugando"; n++) {
    for (const paso of pasos(s, decidir(s))) s = paso(s);
  }
  return s;
}

test("con tres iguales los aparta y vuelve a tirar", () => {
  const s = tirar(conBot(), { azar: secuencia(6, 6, 2, 6, 3) });
  const a = decidir(s);
  assert.equal(a.tipo, "tirar");
  assert.deepEqual(a.guardados, [true, true, false, true, false]);
});

test("con generala en la mesa la anota", () => {
  let s = conBot();
  s = tirar(s, { azar: secuencia(1, 2, 3, 4, 6) });
  s = tirar(s, { azar: secuencia(3) }); // no es servida
  assert.deepEqual(decidir(s), { tipo: "anotar", id: "generala" });
});

test("sin tiros anota en la jugada que más conviene", () => {
  let s = conBot();
  for (let i = 0; i < 3; i++) s = tirar(s, { azar: secuencia(2, 2, 2, 5, 5) });
  assert.deepEqual(decidir(s), { tipo: "anotar", id: "full" });
});

test("en la obligada anota en la jugada que toca", () => {
  let s = conBot("obligada");
  for (let i = 0; i < 3; i++) s = tirar(s, { azar: secuencia(2, 2, 2, 5, 5) });
  assert.deepEqual(decidir(s), { tipo: "anotar", id: "1" });
});

test("cantado de abajo da vuelta el dado que más le sirve", () => {
  let s = conBot("cantada");
  s = tirar(s, { azar: secuencia(4, 4, 4, 4, 2) });
  s = { ...s, guardados: [true, true, true, true, false] };
  s = tirar(s, { canto: "abajo", azar: secuencia(3) }); // el 3 dado vuelta es 4: generala
  assert.deepEqual(decidir(s), { tipo: "voltear", slot: 4 });
});

for (const modo of Object.keys(MODOS)) {
  test(`juega una partida entera en modo ${modo}`, () => {
    const s = jugarPartida(modo);
    assert.equal(s.estado, "terminada");
    if (!s.servida) assert.ok(totalPuntos(s.planillas.b) > 0);
  });
}

test("el bot juega mejor que una estrategia ingenua", () => {
  // Apartar siempre el número más repetido y anotar donde más puntos da promedia unos 123.
  // El bot promedia unos 150: con 20 partidas exigimos más de 135.
  let suma = 0;
  let partidas = 0;
  while (partidas < 20) {
    const s = jugarPartida("comun");
    if (s.servida) continue;
    suma += totalPuntos(s.planillas.b);
    partidas++;
  }
  assert.ok(suma / partidas > 135, `promedio ${suma / partidas}`);
});

test("anotar no se rompe con una planilla casi llena", () => {
  let s = conBot();
  s.planillas.b = { 1: 3, 2: 4, 3: 9, 4: 8, 5: 15, 6: 18, escalera: 20, full: 30, poker: 40, generala: 0 };
  s = tirar(s, { azar: secuencia(1, 2, 3, 4, 6) });
  for (let i = 0; i < 5 && s.estado === "jugando"; i++) for (const p of pasos(s, decidir(s))) s = p(s);
  assert.equal(s.planillas.b.doble, 0);
  assert.equal(s.estado, "terminada");
});
