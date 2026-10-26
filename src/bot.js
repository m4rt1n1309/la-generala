// Bot de Generala: decide la próxima acción del jugador de turno.
//
// Para elegir qué dados apartar (y cuántos cantar de abajo) prueba las 32 combinaciones
// posibles y simula unas cuantas tiradas de cada una, quedándose con la que en promedio deja
// la mejor jugada para anotar. Sin dependencias de UI: se usa igual en local y online.

import * as G from "./generala.js";

// Lo que vale "en promedio" cada jugada: anotar por debajo de esto es desperdiciarla, así que
// el bot compara puntos contra este valor (tachar Doble Generala cuesta poco, tachar Seises mucho).
const ESPERADO = {
  1: 2, 2: 5, 3: 8, 4: 11, 5: 14, 6: 17,
  escalera: 8, full: 12, poker: 14, generala: 10, doble: 2,
};
const SIMULACIONES = 150;

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

// Todas las formas de elegir `k` posiciones de `posiciones`.
function combinaciones(posiciones, k) {
  if (k === 0) return [[]];
  if (posiciones.length < k) return [];
  const [primera, ...resto] = posiciones;
  return [...combinaciones(resto, k - 1).map((c) => [primera, ...c]), ...combinaciones(resto, k)];
}

// Las `k` posiciones de `candidatos` que conviene dar vuelta, y lo que vale la jugada que quedaría.
function mejorVuelta(estado, dados, candidatos, k) {
  let mejor = null;
  for (const elegidos of combinaciones(candidatos, k)) {
    const vuelta = dados.slice();
    for (const i of elegidos) vuelta[i] = 7 - vuelta[i];
    const valor = mejorJugada(estado, vuelta, false).valor;
    if (!mejor || valor > mejor.valor) mejor = { elegidos, valor };
  }
  return mejor;
}

// Valor esperado de apartar `guardados`, cantar `abajo` dados de abajo (null: sin cantar) y tirar
// con `quedan` tiros por delante. Todas las opciones se simulan con las mismas tiradas (`tiradas`),
// así la comparación entre ellas no depende de la suerte de cada una.
function simular(estado, guardados, abajo, quedan, tiradas) {
  const tirados = [0, 1, 2, 3, 4].filter((i) => !guardados[i]);
  let total = 0;
  for (const [primera, segundaTirada] of tiradas) {
    let dados = estado.dados.map((d, i) => (guardados[i] ? d : primera[i]));
    let valor;
    if (abajo) {
      // Hay que dar vuelta `abajo` de los que salieron: los mejores posibles.
      valor = mejorVuelta(estado, dados, tirados, abajo).valor;
    } else {
      if (quedan > 1) {
        const segunda = apartarRapido(dados);
        dados = dados.map((d, i) => (segunda[i] ? d : segundaTirada[i]));
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
  const cinco = () => [azar(), azar(), azar(), azar(), azar()];
  const tiradas = Array.from({ length: SIMULACIONES }, () => [cinco(), cinco()]);
  for (let mascara = 0; mascara < 31; mascara++) {
    const guardados = [0, 1, 2, 3, 4].map((i) => !!(mascara & (1 << i)));
    const apartados = guardados.filter(Boolean).length;
    // Con al menos un dado apartado se puede cantar cuántos van de abajo (0 a los que se tiran);
    // todos de arriba es igual que no cantar.
    const cantos = cantada && apartados > 0 ? Array.from({ length: 6 - apartados }, (_, k) => k) : [null];
    for (const abajo of cantos) {
      const valor = simular(s, guardados, abajo, quedan, tiradas);
      if (valor > mejor.valor) mejor = { tipo: "tirar", guardados, abajo, valor };
    }
  }
  return mejor;
}

// Devuelve la próxima acción del jugador de turno:
//   { tipo: "tirar", guardados?, abajo? } | { tipo: "voltear", slot } | { tipo: "anotar", id }
export function decidir(estado, { azar = dadoAlAzar } = {}) {
  const s = G.normalizar(estado);
  if (s.voltear.length) {
    // Cantó dados de abajo: da vuelta (de a uno) los que dejan mejor la jugada.
    return { tipo: "voltear", slot: mejorVuelta(s, s.dados, s.voltear, s.porVoltear).elegidos[0] };
  }
  if (s.tiro === 0) return { tipo: "tirar" };
  if (s.tiro >= G.TIROS_POR_TURNO) return { tipo: "anotar", id: mejorJugada(s, s.dados, false).id };

  const jugada = elegirJugada(s, azar);
  if (jugada.tipo === "anotar") return { tipo: "anotar", id: jugada.id };
  return { tipo: "tirar", guardados: jugada.guardados, abajo: jugada.abajo };
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
      const tirar = (s) => G.tirar(s, { abajo: accion.abajo ?? null });
      if (!accion.guardados || estado.tiro === 0) return [tirar];
      return [(s) => G.fijarGuardados(s, accion.guardados), tirar];
    }
  }
  return [];
}
