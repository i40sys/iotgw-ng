import { defineConfig, configDefaults } from "vitest/config";

// Default (unit) test run. The e2e/ suite drives the live kind cluster over
// HTTP and must NOT run here — it has its own config (vitest.e2e.config.ts,
// `pnpm test:e2e`).
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
