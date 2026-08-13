import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
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
