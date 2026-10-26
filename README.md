# La Generala

Generala con dados 3D en el navegador. Se juega en una sola compu (de 1 a 6 jugadores pasándose el turno) u **online**, cada uno desde su celular o compu, con **bots** para completar la mesa y **chat** en la sala.

**Jugar:** https://m4rt1n1309.github.io/la-generala/ (también está en [La Juegoteca](https://lajuegotecavercelapp.vercel.app/)).

Modos: **común**, **cantada**, **obligada** y **obligada cantada**.

## Cómo funciona

No tiene servidor propio, igual que el Bingo Musical:

- **GitHub Pages** publica la página. Se actualiza sola en cada push a `main` (`.github/workflows/pages.yml`).
- **Firebase Realtime Database** (plan gratis) guarda cada sala: jugadores, modo y estado de la partida.
- El jugador de turno sortea los dados y guarda el resultado. Todos los dispositivos animan la misma tirada en 3D con [dice-box-threejs](https://github.com/3d-dice/dice-box-threejs), que hace caer los dados en los números sorteados.
- Las salas que pasan **24 horas sin actividad** se borran solas: como no hay servidor, cada vez que alguien crea una sala se borran hasta 20 salas abandonadas. Las reglas solo dejan borrar salas así de viejas (y para encontrarlas permiten listar de a 20 salas, ordenadas por actividad).

## Configurar Firebase (una sola vez)

1. En [console.firebase.google.com](https://console.firebase.google.com): **Agregar proyecto** (sin Google Analytics).
2. **Compilación → Authentication → Comenzar →** habilitar el proveedor **Anónimo**.
3. **Compilación → Realtime Database → Crear base de datos** (en modo bloqueado). Después, en la pestaña **Reglas**, pegar el contenido de `database.rules.json` y **Publicar**.
4. **Configuración del proyecto → Tus apps → Web (`</>`)**: registrar la app y copiar los datos de `firebaseConfig` en `src/firebase-config.js`. No son secretos: lo que protege los datos son las reglas.
5. Subir los cambios a GitHub.

## Publicar en GitHub Pages (una sola vez)

En el repo de GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Desde ahí, cada push a `main` publica el juego en https://m4rt1n1309.github.io/la-generala/.

## Desarrollo

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # tests de las reglas y del bot
```

Para probar el modo online en la compu sin tocar el Firebase real: `npm run emuladores` (necesita Java; la versión 10 de firebase-tools anda con Java 8) y abrir http://localhost:5173/?emulador. Mientras `src/firebase-config.js` no esté configurado, en localhost se usa el emulador solo. Agregando `&otro` a la dirección, esa pestaña entra como otro jugador.

Si cambiás `database.rules.json`, publicalas con `npm run deploy-rules` (o pegándolas en la consola de Firebase).

## Cómo se juega

- Hasta 3 tiros por turno. Tocá un dado del panel para apartarlo: no vuelve al cubilete.
- Escalera 20, Full 30 y Póker 40 (+5 si salen servidas). Generala 50; servida gana la partida. Doble Generala 100, solo si ya anotaste una Generala. La escalera 3-4-5-6-1 también vale.
- **Cantada:** antes del 2.º y del 3.º tiro, si apartaste al menos un dado (con los 5 en el cubilete no se canta), podés cantar:
  - **de arriba:** los dados quedan como salen;
  - **de abajo:** después de tirar elegís uno de los dados que salieron del cubilete y se da vuelta (muestra la cara de abajo, que suma 7 con la de arriba).
  Cantar no gasta un tiro.
- **Obligada:** las jugadas se anotan en orden, de Unos a Doble Generala. Si no sale, se tacha.
- **Obligada cantada:** las dos cosas juntas.

Online: uno crea la sala y pasa el código de 4 letras o el link; los demás entran con su nombre y el anfitrión empieza. Si alguien se desconecta, al volver a abrir el link vuelve a su lugar; si no vuelve, el anfitrión lo puede sacar (✕ al lado del nombre en la planilla). Con 💬 se chatea con todos los de la sala.

**Bots:** en "En esta compu" se eligen cuántos (hasta completar 6 jugadores); online, el anfitrión los agrega con 🤖 en la sala de espera. Para decidir qué dados apartar, si cantar de abajo y dónde anotar, el bot prueba todas las combinaciones y simula tiradas (`src/bot.js`); promedia unos 150 puntos por partida. Online los bots juegan desde el dispositivo del anfitrión: si el anfitrión cierra la página, los bots esperan a que vuelva.

## Estructura

- `src/generala.js`: reglas y estado de la partida (lo usan igual el modo local y el online).
- `src/mesa.js`: los dados 3D.
- `src/bot.js`: el bot.
- `src/red.js`: Firebase (salas, presencia, jugadas, chat, limpieza de salas viejas).
- `src/main.js`: pantallas e interacción.
- `database.rules.json`: reglas de seguridad de Firebase.
