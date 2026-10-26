# La Generala

Generala con dados 3D en el navegador, para 1 a 6 jugadores en la misma compu.

Usa [dice-box](https://github.com/3d-dice/dice-box) (BabylonJS + física con Ammo.js) y el tema de dados con puntos `smooth-pip` de [dice-themes](https://github.com/3d-dice/dice-themes).

## Cómo correrlo

```sh
npm install
npm run dev
```

Y abrí http://localhost:5173.

## Cómo se juega

- Cada jugador tiene hasta 3 tiros por turno. Tocá un dado del panel para guardarlo entre tiros (también se tira con la barra espaciadora).
- Al anotar, el turno pasa al siguiente jugador.
- Escalera 20, Full 30 y Póker 40 (+5 si salen servidas). Generala 50; servida gana la partida. Doble Generala 100, solo si ya anotaste una Generala.
- La escalera 3-4-5-6-1 también vale.

## Estructura

- `src/generala.js`: reglas de puntaje.
- `src/main.js`: turnos, jugadores e integración con dice-box.
- `public/assets/dice-box/`: física (`.wasm`) y temas de dados que dice-box carga en tiempo de ejecución.
