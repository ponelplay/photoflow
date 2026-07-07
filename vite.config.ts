import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Config pensada per Tauri: port fix i sense obrir navegador
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    // Tauri espera el 5173 (devUrl); el panell de preview injecta PORT propi
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
    watch: {
      // cargo escriu a target/ mentre compila; vigilar-ho peta amb EBUSY
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "chrome120",
    minify: "esbuild",
    sourcemap: false,
  },
});
