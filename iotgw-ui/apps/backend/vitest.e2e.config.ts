import { defineConfig } from "vitest/config";

// End-to-end suite: exercises the deployed backend on the live kind cluster.
// Kept separate from the unit config so `pnpm test` stays hermetic.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
