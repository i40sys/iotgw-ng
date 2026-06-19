import { defineConfig, devices } from "@playwright/test";

/**
 * Browser e2e against the live kind cluster.
 *
 * The SPA and backend are reached through the nginx Ingress by vhost. From a
 * WSL shell those hostnames don't resolve and the NodePorts aren't bound on
 * the host, so we point Chromium's resolver at the Ingress IP
 * (--host-resolver-rules). The browser then sends the correct Host header and
 * the SPA's baked VITE_API_URL (http://iotgw-ui-backend.wsl.ymbihq.local)
 * resolves the same way. Override the IP/hosts via E2E_* when running
 * elsewhere.
 */
const APP_HOST = process.env.E2E_APP_HOST ?? "iotgw-ui.wsl.ymbihq.local";
const BACKEND_HOST =
  process.env.E2E_BACKEND_HOST ?? "iotgw-ui-backend.wsl.ymbihq.local";
const INGRESS_IP = process.env.E2E_INGRESS_ADDR ?? "127.0.0.1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://${APP_HOST}`,
    trace: "on-first-retry",
    launchOptions: {
      args: [
        `--host-resolver-rules=MAP ${APP_HOST} ${INGRESS_IP}, MAP ${BACKEND_HOST} ${INGRESS_IP}`,
      ],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
