import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import path from "path";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    open: false,
    allowedHosts: true,
    watch: {
      usePolling: true,
    },
    // Dev-only proxy: routes /api/* to the local Express server so the browser
    // does not need VITE_API_BASE during local development. In a deployed Render
    // Static Site build, VITE_API_BASE points directly to the backend origin and
    // this proxy is not used.
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
