import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const backendTarget = process.env.FYADR_E2E_BACKEND_URL
  || process.env.FYADR_BACKEND_URL
  || "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          return id.includes("node_modules") ? "vendor" : undefined;
        },
      },
    },
  },
});
