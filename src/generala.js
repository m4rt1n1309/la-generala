// Reglas de puntaje de la Generala. Sin dependencias de UI ni de dice-box.

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
