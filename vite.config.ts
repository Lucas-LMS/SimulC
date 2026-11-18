import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/SimulC/" : "/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(projectRoot, "client/src") } },
  root: path.resolve(projectRoot, "client/src"),
  publicDir: path.resolve(projectRoot, "client/public"),
  build: { outDir: path.resolve(projectRoot, "dist"), emptyOutDir: true },
});
