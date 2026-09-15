import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Fixed, IPv4-visible bind: Orca's Windows browser resolves localhost on
    // Windows and WSL2 only forwards 0.0.0.0 binds, and strictPort keeps the
    // port deterministic so scripts/dev-session.sh can detect our own orphans.
    host: "0.0.0.0",
    // 52173, not Vite's default 5173: in the Orca runtime 5173 is squatted by
    // another service (Keycloak) we can't kill. A unique fixed port lets
    // `just dev` always coexist. (The k8s NodePort 5173 is separate.)
    port: 52173,
    strictPort: true,
    allowedHosts: ["wsl.ymbihq.local"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    // e2e/ runs under Playwright (pnpm test:e2e), not vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
