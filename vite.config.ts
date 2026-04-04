import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: ".",
  resolve: {
    alias: {
      "@client": path.resolve(__dirname, "src/client"),
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4120",
      "/events": {
        target: "http://localhost:4120",
        // SSE requires proxy to not buffer responses
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            // Disable buffering for SSE streams
            proxyRes.headers["x-accel-buffering"] = "no";
            proxyRes.headers["cache-control"] = "no-cache, no-transform";
          });
        },
      },
    },
  },
  build: {
    outDir: "dist/client",
    sourcemap: true,
  },
});
