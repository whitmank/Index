// Authored by Karter Whitman using Claude Opus 4.8
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base: "./"` so the production bundle loads from file:// inside the
// packaged app; in dev the main process points at the server below.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5273, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
