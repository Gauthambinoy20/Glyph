/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// During development, calls to /api are proxied to the FastAPI backend on :8000,
// so the frontend and backend feel like one origin (no CORS hassle).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  // Component tests render real React into a fake browser DOM (jsdom).
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // Exclude tests, the jsdom setup, the bootstrap, and type-only declarations
      // (main.tsx only mounts React; types.ts has no runtime statements).
      exclude: ["src/**/*.test.{ts,tsx}", "src/test-setup.ts", "src/main.tsx", "src/types.ts"],
      reporter: ["text", "html", "json-summary"],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
