/**
 * End-to-end: the full provisioning cycle through the real backend on the live
 * kind cluster. Asserts *outcomes*, not 202s.
 *
 *   1. createNetwork -> network_jobs SUCCESS   (DB trigger -> pg_net ->
 *                                               netmaker-call -> POST /networks)
 *   2. createDevice  -> ssh_key_id minted      (backend -> Cosmian KMS)
 *                    -> device_jobs SUCCESS     (netmaker-call -> Netmaker extclient)
 *   3. teardown: delete device + network; rows gone (Netmaker deprovision fires
 *                in the background — see netmaker-call logs).
 *
 * Why create the network here instead of reusing one? A device only provisions
 * into a network that actually exists in Netmaker. Reusing a row that was
 * seeded straight into Postgres (never provisioned) yields a false
 * "No nodes found in network" failure — which is exactly the trap this cycle
 * test avoids by provisioning its own network first.
 *
 * KMS only works in-cluster (the task-057 NetworkPolicy blocks its NodePort
 * from the host), so the test drives the deployed backend over HTTP rather than
 * importing the router. Requires the kind stack up (`just bootstrap`) and a
 * reachable Netmaker API; soft-skips if the backend is unreachable.
 *
 * Run: `pnpm --filter @iotgw/backend test:e2e`
 */
import { describe, it, expect, beforeAll } from "vitest";
import { trpcQuery, trpcMutate, e2eTarget } from "./trpc-client";

const JOB_TIMEOUT_MS = Number(process.env.E2E_JOB_TIMEOUT_MS ?? "45000");

type Job = { status: string; error_message: string | null };
type Row = { id: string; name: string };

async function backendReachable(): Promise<boolean> {
  try {
    await trpcQuery("getDomains");
    return true;
  } catch {
    return false;
  }
}

async function pollTerminalJob(
  proc: "listNetworkJobs" | "listDeviceJobs",
  input: Record<string, unknown>,
): Promise<Job | undefined> {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  let last: Job | undefined;
  while (Date.now() < deadline) {
    const jobs = await trpcQuery<Job[]>(proc, { ...input, limit: 1 });
    last = jobs?.[0];
    if (last?.status === "SUCCESS" || last?.status === "FAILED") return last;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return last;
}

// A high, per-run CIDR to avoid overlapping an existing Netmaker network.
function uniqueCidr(seed: number): string {
  const a = 200 + (Math.floor(seed / 256) % 50);
  const b = seed % 256;
  return `10.${a}.${b}.0/24`;
}

describe("network + device provisioning cycle (live kind stack)", () => {
  let up = false;

  beforeAll(async () => {
    up = await backendReachable();
    if (!up) {
      console.warn(
        `[e2e] backend not reachable at Host=${e2eTarget.HOST} via ` +
          `${e2eTarget.ADDR}:${e2eTarget.PORT} — skipping. Bring up the kind ` +
          `stack (just bootstrap) or override E2E_INGRESS_ADDR/E2E_INGRESS_PORT/` +
          `E2E_BACKEND_HOST.`,
      );
    }
  });

  it("provisions a network, a device inside it, then tears both down", async () => {
    if (!up) return;

    const domainId =
      process.env.E2E_DOMAIN_ID ??
      (await trpcQuery<Row[]>("getDomains"))?.[0]?.id;
    expect(domainId, "no domain available — set E2E_DOMAIN_ID").toBeTruthy();

    const stamp = Date.now();
    let networkId: string | undefined;
    let deviceId: string | undefined;

    try {
      // 1) Provision a fresh network — must succeed in Netmaker.
      const network = await trpcMutate<Row>("createNetwork", {
        domain_id: domainId,
        name: `__e2e_net_${stamp}`,
        ipv4_cidr: uniqueCidr(stamp),
      });
      networkId = network?.id;
      expect(networkId, "createNetwork returned no id").toBeTruthy();

      const netJob = await pollTerminalJob("listNetworkJobs", {
        network_id: networkId,
      });
      expect(
        netJob,
        "no network_jobs row — the pg_net webhook to netmaker-call never fired",
      ).toBeTruthy();
      expect(
        netJob!.status,
        `network provisioning failed: ${netJob!.error_message}`,
      ).toBe("SUCCESS");

      // 2) Provision a device into that network — SSH key + Netmaker extclient.
      const device = await trpcMutate<Row>("createDevice", {
        network_id: networkId,
        name: `__e2e_dev_${stamp}`,
      });
      deviceId = device?.id;
      expect(deviceId, "createDevice returned no id").toBeTruthy();

      const ssh = await trpcQuery<{ hasSshKey: boolean; sshKeyId: string | null }>(
        "checkSshKeyStatus",
        { device_id: deviceId },
      );
      expect(
        ssh.hasSshKey,
        "device created without an SSH key — backend->KMS mint failed",
      ).toBe(true);
      expect(ssh.sshKeyId).toBe(`device_ssh_${deviceId}`);

      const devJob = await pollTerminalJob("listDeviceJobs", {
        device_id: deviceId,
      });
      expect(devJob, "no device_jobs row").toBeTruthy();
      expect(
        devJob!.status,
        `device provisioning failed: ${devJob!.error_message}`,
      ).toBe("SUCCESS");

      // Netmaker really issued a WireGuard config (not just a green job row).
      const full = await trpcQuery<{
        ip_address: string | null;
        public_key: string | null;
      }>("getDevice", { id: deviceId });
      expect(full.ip_address, "Netmaker assigned no IP address").toBeTruthy();
      expect(
        full.public_key,
        "Netmaker returned no WireGuard public key",
      ).toBeTruthy();

      // Cosmian KMS really holds the SSH key — round-trip it back out, don't
      // trust the ssh_key_id flag alone.
      const key = await trpcQuery<{ publicKey: string }>(
        "getDeviceSshPublicKey",
        { device_id: deviceId },
      );
      expect(
        key.publicKey,
        "KMS did not return a usable OpenSSH public key",
      ).toMatch(/^ssh-ed25519 /);

      // 3) Teardown — remove the device, then the network; confirm both gone.
      await trpcMutate("deleteDevice", { id: deviceId });
      deviceId = undefined;
      await trpcMutate("deleteNetwork", { id: networkId });
      const remaining = await trpcQuery<Row[]>("getNetworks");
      expect(remaining?.some((n) => n.id === networkId)).toBe(false);
      networkId = undefined;
    } finally {
      // Emergency cleanup if an assertion threw mid-cycle.
      if (deviceId) await trpcMutate("deleteDevice", { id: deviceId }).catch(() => {});
      if (networkId) await trpcMutate("deleteNetwork", { id: networkId }).catch(() => {});
    }
  });
});
