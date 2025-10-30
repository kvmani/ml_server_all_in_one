import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, "."),
  base: "/static/react/",
  build: {
    outDir: resolve(__dirname, "../app/ui/static/react"),
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, "src/main.tsx"),
    },
  },
});
