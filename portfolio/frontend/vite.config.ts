import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  // the demo build is served from a sub-path of a static site (e.g. /portfolio/): relative asset URLs
  base: mode === "demo" ? "./" : "/",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  build: { chunkSizeWarningLimit: 1500 },
}));
