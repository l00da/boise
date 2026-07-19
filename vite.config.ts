import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3847",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      // gold-grey sources use `@/...` (same mapping as vitest.config / tsconfig)
      "@": path.resolve(__dirname, "../../gold-grey/src"),
      "@workbench": path.resolve(__dirname, "./src"),
    },
  },
});

