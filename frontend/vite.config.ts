import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, "."),
  base: "/static/react/",
  server: {
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
  build: {
    outDir: resolve(__dirname, "../app/ui/static/react"),
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, "src/main.tsx"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: resolve(__dirname, "tests/setup.ts"),
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reportsDirectory: resolve(__dirname, "coverage"),
    },
  },
});
