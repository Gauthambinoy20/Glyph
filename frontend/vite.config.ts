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
  },
});
