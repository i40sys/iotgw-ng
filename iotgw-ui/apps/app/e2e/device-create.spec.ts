/**
 * Browser e2e: the device half of the provisioning cycle, through the real UI
 * on the live kind cluster.
 *
 * This layer catches what a backend-only test cannot — the UI's create POST
 * actually reaching the backend. To exercise a *complete* cycle (and avoid the
 * stale-seed-network trap), the spec provisions its own network via the API
 * first, drives the device-create form against it, then verifies the outcome
 * (device persisted, SSH key minted, Netmaker job SUCCESS) and tears it all
 * down.
 *
 * Requires the kind stack up (`just bootstrap`), a reachable Netmaker API, and
 * Chromium installed (`pnpm exec playwright install chromium`).
 *
 * Run: `pnpm --filter @iotgw/app test:e2e`
 */
import { test, expect } from "@playwright/test";
import { trpcQuery, trpcMutate } from "./api";

type Row = { id: string; name: string };
type Job = { status: string };

const stamp = Date.now();
const NET_NAME = `__e2e_ui_net_${stamp}`;
const DEV_NAME = `__e2e_ui_dev_${stamp}`;
const CIDR = `10.250.${stamp % 256}.0/24`;

let domainName: string;
let networkId: string | undefined;
let deviceId: string | undefined;

test.beforeAll(async () => {
  const domains = await trpcQuery<Row[]>("getDomains");
  expect(domains?.length, "need at least one domain").toBeGreaterThan(0);
  domainName = domains[0].name;

  const network = await trpcMutate<Row>("createNetwork", {
    domain_id: domains[0].id,
    name: NET_NAME,
    ipv4_cidr: CIDR,
  });
  networkId = network.id;

  // The device can only attach once the network exists in Netmaker.
  await expect
    .poll(
      async () => {
        const jobs = await trpcQuery<Job[]>("listNetworkJobs", {
          network_id: networkId,
          limit: 1,
        });
        return jobs?.[0]?.status;
      },
      { timeout: 45_000, message: "test network never provisioned" },
    )
    .toBe("SUCCESS");
});

test.afterAll(async () => {
  if (deviceId) await trpcMutate("deleteDevice", { id: deviceId }).catch(() => {});
  if (networkId) await trpcMutate("deleteNetwork", { id: networkId }).catch(() => {});
});

test("creating a device through the UI provisions it end-to-end", async ({
  page,
}) => {
  await page.goto("/devices");

  // Open the create dialog (header button shares the "Create Device" label
  // with the submit button, so the submit is scoped to the dialog below).
  await page.getByRole("button", { name: "Create Device" }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Domain must be picked before Network is enabled (Radix Select -> combobox).
  const combos = dialog.getByRole("combobox");
  await combos.nth(0).click();
  await page.getByRole("option", { name: domainName, exact: true }).click();
  await combos.nth(1).click();
  await page.getByRole("option", { name: NET_NAME, exact: true }).click();

  await dialog.locator("#create-name").fill(DEV_NAME);
  await dialog.getByRole("button", { name: "Create Device" }).click();

  // Dialog closes only after the create mutation resolves -> proves the UI
  // POST reached the backend.
  await expect(dialog).toBeHidden();

  // Outcome via the API: persisted, SSH key minted, Netmaker job SUCCESS.
  await expect
    .poll(
      async () => {
        const devices = await trpcQuery<Row[]>("getDevices");
        deviceId = devices?.find((d) => d.name === DEV_NAME)?.id;
        return Boolean(deviceId);
      },
      { message: "device created in UI never appeared via the API" },
    )
    .toBe(true);

  await expect
    .poll(
      async () => {
        const jobs = await trpcQuery<Job[]>("listDeviceJobs", {
          device_id: deviceId,
          limit: 1,
        });
        return jobs?.[0]?.status;
      },
      { timeout: 45_000, message: "device never provisioned in Netmaker" },
    )
    .toBe("SUCCESS");

  // Netmaker really issued a WireGuard config.
  const full = await trpcQuery<{
    ip_address: string | null;
    public_key: string | null;
  }>("getDevice", { id: deviceId });
  expect(full.ip_address, "Netmaker assigned no IP address").toBeTruthy();
  expect(full.public_key, "Netmaker returned no WireGuard public key").toBeTruthy();

  // Cosmian KMS really holds the SSH key (round-trip, not just a DB flag).
  const key = await trpcQuery<{ publicKey: string }>("getDeviceSshPublicKey", {
    device_id: deviceId,
  });
  expect(key.publicKey, "KMS did not return a usable OpenSSH public key").toMatch(
    /^ssh-ed25519 /,
  );
});
