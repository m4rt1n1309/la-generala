// Mesa 3D: reproduce con dados en 3D lo que dice el estado de la partida.
//
// Los valores los decide la partida (no la física): dice-box-threejs tira los dados y les cambia
// las caras para que caigan en esos números, así todos los dispositivos ven lo mismo.
//
// Coordenadas: el mundo va de -ancho a +ancho y de -alto a +alto (ancho y alto del contenedor,
// en box.display), y la cámara ve justo eso. Abajo hay una bandeja, separada por una pared, donde
// se ponen los dados apartados: los que se tiran no llegan hasta ahí, así que no se chocan.

import DiceBox from "@3d-dice/dice-box-threejs";

const MITAD = 0.52;     // medio lado de un dado, en proporción a baseScale
const MARGEN = 1.3;     // distancia de las paredes al borde de la mesa, en medios lados
const BANDEJA = 3.4;    // alto de la bandeja de apartados, en medios lados
const SEPARACION = 3.2; // distancia entre los dados apartados, en medios lados
const MOVIMIENTO = 250; // ms que tarda un dado en ir a la bandeja o volver

// Tamaño de los dados según la mesa: en la compu quedan como siempre (150) y en el celular
// se achican para que los 5 entren sin chocarse ni superponerse.
function tamanoDados(contenedor) {
  const lado = Math.min(contenedor.clientWidth, contenedor.clientHeight);
  return Math.round(Math.min(150, Math.max(40, lado * 0.14)));
}

export function crearMesa(selector) {
  const contenedor = document.querySelector(selector);
  const box = new DiceBox(selector, {
    assetPath: import.meta.env.BASE_URL,
    sounds: true, // golpes de los dados contra la mesa y entre ellos (mp3 en public/sounds)
    theme_surface: "green-felt",
    theme_colorset: "white",
    theme_material: "plastic",
    baseScale: tamanoDados(contenedor),
    strength: 1.4,
  });

  const bandeja = document.createElement("div");
  bandeja.className = "bandeja";
  contenedor.before(bandeja); // debajo del canvas (que es transparente)

  const medida = () => {
    const mitad = MITAD * box.DiceFactory.baseScale;
    return { mitad, ancho: box.display.containerWidth, alto: box.display.containerHeight };
  };

  // Paredes más adentro que las de la librería (así ningún dado queda cortado en el borde) y la de
  // abajo por encima de la bandeja.
  const paredesOriginales = box.makeWorldBox.bind(box);
  box.makeWorldBox = () => {
    paredesOriginales();
    const { mitad, ancho, alto } = medida();
    const p = box.box_body;
    p.leftWall.position.x = ancho - MARGEN * mitad;
    p.rightWall.position.x = -(ancho - MARGEN * mitad);
    p.topWall.position.y = alto - MARGEN * mitad;
    p.bottomWall.position.y = -alto + BANDEJA * mitad;
    bandeja.style.height = `${(BANDEJA * mitad * contenedor.clientHeight) / (2 * alto)}px`;
  };

  // Los dados arrancan desde el borde de la mesa: que no aparezcan en la bandeja ni fuera de las paredes.
  const vectoresOriginales = box.getNotationVectors.bind(box);
  box.getNotationVectors = (...args) => {
    const r = vectoresOriginales(...args);
    const { mitad, ancho, alto } = medida();
    const dentro = (v, min, max) => Math.min(max, Math.max(min, v));
    for (const { pos } of r.vectors || []) {
      pos.x = dentro(pos.x, -ancho + (MARGEN + 2) * mitad, ancho - (MARGEN + 2) * mitad);
      pos.y = dentro(pos.y, -alto + (BANDEJA + 2) * mitad, alto - (MARGEN + 2) * mitad);
    }
    return r;
  };

  const lista = box.initialize();

  // Acomoda el mundo cuando cambia el tamaño de la mesa (al cargar el CSS, al girar el celular…).
  new ResizeObserver(() =>
    lista.then(() => {
      const { clientWidth: w, clientHeight: h } = contenedor;
      if (!w || !h) return;
      // Los dados nuevos salen con el tamaño de la mesa actual.
      const tamano = tamanoDados(contenedor);
      if (tamano !== box.DiceFactory.baseScale) {
        box.DiceFactory.baseScale = tamano;
        box.DiceFactory.geometries = {};
      }
      if (w === box.display.containerWidth && h === box.display.containerHeight) return;
      box.setDimensions({ x: w, y: h });
      if (estadoActual) acomodar(estadoActual, false);
      box.renderer.render(box.scene, box.camera);
    })
  ).observe(contenedor);

  let slots = [];      // posición del dado en la partida (0-4) → índice en box.diceList
  let ultimo = null;   // número del último evento mostrado
  let estadoActual = null;
  let cola = lista;

  const pip = (valores) => `${valores.length}dpip@${valores.join(",")}`;

  function limpiar() {
    box.clearDice();
    slots = [];
  }

  // Tira los 5 dados desde cero, cayendo en `dados`.
  async function tirarTodos(dados) {
    limpiar();
    const r = await box.roll(pip(dados));
    slots = r.sets[0].rolls.map((d) => d.id);
  }

  // Giro alrededor del eje vertical que deja al dado derecho (con los lados paralelos a la mesa),
  // sin cambiar la cara de arriba.
  function enderezado(dado) {
    const q = dado.quaternion.clone();
    const Eje = dado.position.constructor;
    let lado = null;
    for (const eje of [new Eje(1, 0, 0), new Eje(0, 1, 0), new Eje(0, 0, 1)]) {
      const v = eje.applyQuaternion(q);
      if (!lado || Math.abs(v.z) < Math.abs(lado.z)) lado = v;
    }
    const angulo = Math.atan2(lado.y, lado.x);
    const giro = angulo - Math.round(angulo / (Math.PI / 2)) * (Math.PI / 2);
    return q.premultiply(new q.constructor().setFromAxisAngle(new Eje(0, 0, 1), -giro));
  }

  function ubicar(dado, x, y, z, q) {
    dado.position.set(x, y, z);
    dado.quaternion.copy(q);
    dado.body?.position.set(x, y, z);
    dado.body?.quaternion.set(q.x, q.y, q.z, q.w);
  }

  // Lleva los dados apartados a la bandeja y devuelve a su lugar los que se dejaron de apartar.
  function acomodar(estado, animar = true) {
    estadoActual = estado;
    if (!estado || estado.tiro === 0 || slots.length !== 5) return;
    const { mitad, alto } = medida();
    const movimientos = [];
    estado.guardados.forEach((guardado, i) => {
      const dado = box.diceList[slots[i]];
      if (!dado) return;
      let destino = null;
      if (guardado) {
        if (!dado.userData.origen) {
          dado.userData.origen = { pos: dado.position.clone(), q: dado.quaternion.clone() };
        }
        const pos = new dado.position.constructor((i - 2) * SEPARACION * mitad, -alto + (BANDEJA / 2) * mitad, dado.position.z);
        destino = { pos, q: enderezado(dado) };
      } else if (dado.userData.origen) {
        destino = dado.userData.origen;
        delete dado.userData.origen;
      }
      if (destino) movimientos.push({ dado, desde: { pos: dado.position.clone(), q: dado.quaternion.clone() }, destino });
    });
    if (!movimientos.length) return;

    const aplicar = (t) => {
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // arranca y frena suave
      for (const { dado, desde, destino } of movimientos) {
        const pos = desde.pos.clone().lerp(destino.pos, e);
        ubicar(dado, pos.x, pos.y, pos.z, desde.q.clone().slerp(destino.q, e));
      }
      box.renderer.render(box.scene, box.camera);
    };
    if (!animar) return aplicar(1);
    return new Promise((listo) => {
      const inicio = performance.now();
      const cuadro = (ahora) => {
        const t = Math.min(1, (ahora - inicio) / MOVIMIENTO);
        aplicar(t);
        if (t < 1) requestAnimationFrame(cuadro);
        else listo();
      };
      requestAnimationFrame(cuadro);
    });
  }

  async function mostrarEvento(ev, estado) {
    if (ev.tipo === "limpiar") return limpiar();

    if (ev.tipo === "tiro") {
      if (ev.slots.length === 5 || slots.length !== 5) return tirarTodos(estado.dados);
      // Saca de la mesa los dados que volvieron al cubilete y tira esos; los apartados no se mueven.
      await box.remove(ev.slots.map((i) => slots[i]));
      const nuevos = await box.add(pip(ev.valores));
      ev.slots.forEach((slot, k) => (slots[slot] = nuevos[k].id));
      return;
    }

    if (ev.tipo === "vuelta") {
      const dado = box.diceList[slots[ev.slots[0]]];
      if (!dado) return tirarTodos(estado.dados);
      box.swapDiceFace(dado, ev.valores[0]);
      box.renderer.render(box.scene, box.camera);
    }
  }

  async function paso(estado) {
    await lista;
    if (!estado) {
      limpiar();
      ultimo = null;
      estadoActual = null;
      return;
    }
    const ev = estado.evento;
    if (ev.n !== ultimo) {
      if (ultimo !== null && ev.n === ultimo + 1) {
        await mostrarEvento(ev, estado);
      } else if (estado.tiro === 0) {
        // Recién entramos o nos salteamos jugadas: armamos la mesa como está ahora.
        limpiar();
      } else {
        await tirarTodos(estado.dados);
      }
      ultimo = ev.n;
    }
    await acomodar(estado);
  }

  return {
    lista,
    // Prende o apaga el ruido de los dados (los mp3 se cargan igual, así se puede volver a prender).
    silenciar(silencio) {
      box.volume = silencio ? 0 : 100;
    },
    // Encola el estado para mostrarlo después de lo que se esté animando
    // (también cuando solo cambiaron los dados apartados).
    sincronizar(estado) {
      cola = cola.then(() => paso(estado)).catch((err) => console.error("Mesa 3D:", err));
      return cola;
    },
  };
}
