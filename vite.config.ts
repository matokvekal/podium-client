import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// package.json is the single source of truth for the version. Baking it in at build time
// keeps `version` in one place — nothing has to be kept in step by hand, and the running app
// can always say which build it is. Imported rather than read with node:fs so the config
// still typechecks without @types/node.
import pkg from "./package.json";

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    // The API is proxied instead of called cross-origin. Same-origin means the browser
    // sends NO preflight at all — which is what a PATCH to /users/me was dying on: the
    // server answered every OPTIONS with a correct Access-Control-Allow-Methods (PATCH
    // included, verified on the wire), Chrome reported "Method PATCH is not allowed", and
    // the PATCH was never sent. Nothing between the two can rewrite a header that is now
    // never asked for. VITE_API_URL is "/api/v1" in .env to match; set it to an absolute
    // URL for any build that does not go through this dev server.
    proxy: {
      "/api": {
        target: "http://localhost:6500",
        changeOrigin: false,
      },
    },
  },
  build: {
    // Leaflet is lazy-loaded (see LiveMapPage). Commissaire recorded the cost of importing
    // it eagerly: the bundle went from 65 kB to 559 kB. Keeping it in its own chunk makes a
    // regression visible in the build output instead of silent.
    rollupOptions: {
      output: {
        manualChunks: {
          leaflet: ["leaflet"],
        },
      },
    },
  },
});
