import { defineConfig } from "vite";

export default defineConfig({
  // dice-box carga sus mundos (offscreen/onscreen) con import() dinámico;
  // si Vite lo pre-empaqueta, esas rutas se rompen.
  optimizeDeps: {
    exclude: ["@3d-dice/dice-box"],
  },
});
