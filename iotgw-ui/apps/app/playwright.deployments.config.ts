import { defineConfig, devices } from "@playwright/test";

// Isolated UX tests: every API request is fulfilled by fixtures. No gateway is changed.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "deployments-workspace.spec.ts",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.DEPLOYMENTS_PREVIEW_URL ?? "http://localhost:52173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
});
