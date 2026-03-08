import dotenv from 'dotenv';
dotenv.config();
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

const plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime()];

export default defineConfig({
  plugins,
  base: "/",
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "..", "Electron", "src", "renderer"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "client", "index.html"),
        "webdeck/index": path.resolve(import.meta.dirname, "client", "webdeck", "index.html"),
        "loading/index": path.resolve(import.meta.dirname, "client", "loading", "index.html"),
      },
    },
  },
  server: {
    port: Number(process.env.WEB_PORT) || 5173,
    strictPort: false,
    host: true,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.SERVER_PORT || 3000}`,
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: `http://localhost:${process.env.SERVER_PORT || 3000}`,
        ws: true,
      },
    },
    allowedHosts: [
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
