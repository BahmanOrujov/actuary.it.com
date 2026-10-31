import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";

// relative asset URLs only resolve under a trailing slash: /portfolio must become /portfolio/ before they load
const trailingSlash: Plugin = {
  name: "demo-trailing-slash",
  transformIndexHtml: () => [{
    tag: "script",
    injectTo: "head-prepend",
    children: 'if(!location.pathname.endsWith("/")&&!location.pathname.endsWith(".html"))'
      + 'location.replace(location.pathname+"/"+location.search+location.hash)',
  }],
};

export default defineConfig(({ mode }) => ({
  // the demo build is served from a sub-path of a static site (e.g. /portfolio/): relative asset URLs
  base: mode === "demo" ? "./" : "/",
  plugins: mode === "demo" ? [react(), trailingSlash] : [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  build: { chunkSizeWarningLimit: 1500 },
}));
