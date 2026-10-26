// Bot de Generala: decide la próxima acción del jugador de turno.
//
// Para elegir qué dados apartar (y si conviene cantar de abajo) prueba las 32 combinaciones
// posibles y simula unas cuantas tiradas de cada una, quedándose con la que en promedio deja
// la mejor jugada para anotar. Sin dependencias de UI: se usa igual en local y online.

import * as G from "./generala.js";

// Lo que vale "en promedio" cada jugada: anotar por debajo de esto es desperdiciarla, así que
// el bot compara puntos contra este valor (tachar Doble Generala cuesta poco, tachar Seises mucho).
const ESPERADO = {
  1: 2, 2: 5, 3: 8, 4: 11, 5: 14, 6: 17,
  escalera: 8, full: 12, poker: 14, generala: 10, doble: 2,
};
const SIMULACIONES = 80;

const dadoAlAzar = () => 1 + Math.floor(Math.random() * 6);

// La mejor jugada para anotar `dados` según lo que le queda libre al jugador de turno.
function mejorJugada(estado, dados, servida) {
  const planilla = estado.planillas[estado.actual];
  let libres = G.CATEGORIAS.filter((c) => planilla[c.id] === undefined);
  if (G.MODOS[estado.modo].obligada) libres = libres.slice(0, 1);
  let mejor = null;
  for (const { id } of libres) {
    const puntos = G.puntaje(id, dados, { servida, planilla });
    const valor = puntos - ESPERADO[id];
    if (!mejor || valor > mejor.valor) mejor = { id, puntos, valor };
  }
  return mejor;
}

// Política rápida para las simulaciones: apartar los dados del número que más se repite.
function apartarRapido(dados) {
  const cuenta = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dados) cuenta[d]++;
  let cara = 6;
  for (let v = 6; v >= 1; v--) if (cuenta[v] > cuenta[cara]) cara = v;
  return dados.map((d) => d === cara);
}

// Valor esperado de apartar `guardados`, cantar `canto` y tirar con `quedan` tiros por delante.
function simular(estado, guardados, canto, quedan, azar) {
  let total = 0;
  for (let n = 0; n < SIMULACIONES; n++) {
    let dados = estado.dados.map((d, i) => (guardados[i] ? d : azar()));
    let valor;
    if (canto === "abajo") {
      // Hay que dar vuelta uno de los que salieron: el mejor posible.
      valor = -Infinity;
      for (let i = 0; i < 5; i++) {
        if (guardados[i]) continue;
        const vuelta = dados.slice();
        vuelta[i] = 7 - vuelta[i];
        valor = Math.max(valor, mejorJugada(estado, vuelta, false).valor);
      }
    } else {
      if (quedan > 1) {
        const segunda = apartarRapido(dados);
        dados = dados.map((d, i) => (segunda[i] ? d : azar()));
      }
      valor = mejorJugada(estado, dados, false).valor;
    }
    total += valor;
  }
  return total / SIMULACIONES;
}

// Qué hacer después de un tiro: anotar ya, o apartar algunos dados y volver a tirar (cantando o no).
function elegirJugada(estado, azar) {
  const s = estado;
  const servida = s.tiro === 1;
  const anotar = mejorJugada(s, s.dados, servida);
  let mejor = { tipo: "anotar", id: anotar.id, valor: anotar.valor };
  // La generala servida termina la partida sola; y con generala en la mesa no se arriesga.
  if (G.esGenerala(s.dados)) return mejor;

  const quedan = G.TIROS_POR_TURNO - s.tiro;
  const cantada = G.MODOS[s.modo].cantada;
  for (let mascara = 0; mascara < 31; mascara++) {
    const guardados = [0, 1, 2, 3, 4].map((i) => !!(mascara & (1 << i)));
    const apartados = guardados.filter(Boolean).length;
    // Con al menos un dado apartado se puede cantar; de arriba es igual que no cantar.
    const cantos = cantada && apartados > 0 ? ["", "abajo"] : [""];
    for (const canto of cantos) {
      const valor = simular(s, guardados, canto, quedan, azar);
      if (valor > mejor.valor) mejor = { tipo: "tirar", guardados, canto, valor };
    }
  }
  return mejor;
}

// Devuelve la próxima acción del jugador de turno:
//   { tipo: "tirar", guardados?, canto? } | { tipo: "voltear", slot } | { tipo: "anotar", id }
export function decidir(estado, { azar = dadoAlAzar } = {}) {
  const s = G.normalizar(estado);
  if (s.voltear.length) {
    // Cantó de abajo: da vuelta el dado que deja mejor la jugada.
    let mejor = null;
    for (const slot of s.voltear) {
      const dados = s.dados.slice();
      dados[slot] = 7 - dados[slot];
      const valor = mejorJugada(s, dados, false).valor;
      if (!mejor || valor > mejor.valor) mejor = { slot, valor };
    }
    return { tipo: "voltear", slot: mejor.slot };
  }
  if (s.tiro === 0) return { tipo: "tirar" };
  if (s.tiro >= G.TIROS_POR_TURNO) return { tipo: "anotar", id: mejorJugada(s, s.dados, false).id };

  const jugada = elegirJugada(s, azar);
  if (jugada.tipo === "anotar") return { tipo: "anotar", id: jugada.id };
  // En la cantada, si no conviene cantar de abajo canta de arriba (es lo mismo que no cantar).
  const puedeCantar = G.MODOS[s.modo].cantada && jugada.guardados.some(Boolean);
  return { tipo: "tirar", guardados: jugada.guardados, canto: jugada.canto || (puedeCantar ? "arriba" : "") };
}

// Aplica una acción del bot en uno o dos pasos (primero aparta los dados, después tira),
// para que los demás vean qué se guardó antes de que ruede la tirada.
export function pasos(estado, accion) {
  switch (accion.tipo) {
    case "voltear":
      return [(s) => G.voltear(s, accion.slot)];
    case "anotar":
      return [(s) => G.anotar(s, accion.id)];
    case "tirar": {
      const tirar = (s) => G.tirar(s, { canto: accion.canto || "" });
      if (!accion.guardados || estado.tiro === 0) return [tirar];
      return [(s) => G.fijarGuardados(s, accion.guardados), tirar];
    }
  }
  return [];
}
