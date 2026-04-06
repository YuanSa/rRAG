import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  root: path.resolve(process.cwd(), "gui"),
  build: {
    outDir: path.resolve(process.cwd(), "gui/dist"),
    emptyOutDir: true
  }
});
