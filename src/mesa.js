// Mesa 3D: reproduce con dados en 3D lo que dice el estado de la partida.
//
// Los valores los decide la partida (no la física): dice-box-threejs tira los dados y les cambia
// las caras para que caigan en esos números, así todos los dispositivos ven lo mismo.

import DiceBox from "@3d-dice/dice-box-threejs";

export function crearMesa(selector) {
  const box = new DiceBox(selector, {
    assetPath: import.meta.env.BASE_URL,
    sounds: false,
    theme_surface: "green-felt",
    theme_colorset: "white",
    theme_material: "plastic",
    baseScale: 150,
    strength: 1.4,
  });
  const lista = box.initialize();
  addEventListener("resize", () => lista.then(() => box.resizeWorld()));

  let slots = [];      // posición del dado en la partida (0-4) → índice en box.diceList
  let ultimo = null;   // número del último evento mostrado
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
      return;
    }
    const ev = estado.evento;
    if (ev.n === ultimo) return;
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

  return {
    lista,
    // Encola el estado para mostrarlo después de lo que se esté animando.
    sincronizar(estado) {
      cola = cola.then(() => paso(estado)).catch((err) => console.error("Mesa 3D:", err));
      return cola;
    },
  };
}
