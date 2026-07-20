import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ["@workspace/api-client-react"],
  },
  server: {
    port: 5173,
    host: true,
    // Dev-only: allow requests through a temporary tunnel (e.g. trycloudflare.com)
    // for sharing the app during local development.
    allowedHosts: true,
    proxy: {
      "/api": "http://localhost:8080",
    },
    fs: {
      // allow importing the linked workspace package source from repo root
      allow: [fileURLToPath(new URL("../../", import.meta.url))],
    },
  },
});
