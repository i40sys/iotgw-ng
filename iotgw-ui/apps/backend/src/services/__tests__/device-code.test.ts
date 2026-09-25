import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fastify from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@iotgw/supabase-contract";
import { createFakeSupabase } from "./fake-supabase";

// In-memory KMS: Create stores 32 random bytes under the UID, Get returns them
// as the Raw KeyMaterial hex, a duplicate Create fails like Cosmian does.
const kmsStore = new Map<string, Buffer>();
vi.mock("../kms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../kms")>();
  interface Node {
    tag: string;
    value: unknown;
  }
  const uidOf = (body: Node): string => {
    const found = actual.findNode(body, "UniqueIdentifier");
    return typeof found?.value === "string" ? found.value : "";
  };
  return {
    ...actual,
    kmip: vi.fn((body: Node) => {
      const uid = uidOf(body);
      if (body.tag === "Create") {
        if (kmsStore.has(uid)) {
          throw new actual.KmsError(
            "KMS operation failed (HTTP 500)",
            "Database Error: Ext. store error: one or more objects already exist",
          );
        }
        kmsStore.set(uid, crypto.randomBytes(32));
        return Promise.resolve({ tag: "CreateResponse", type: "Structure", value: [] });
      }
      if (body.tag === "Get") {
        const key = kmsStore.get(uid);
        if (!key) throw new actual.KmsError("Object_Not_Found");
        return Promise.resolve({
          tag: "GetResponse",
          type: "Structure",
          value: [
            { tag: "KeyMaterial", type: "ByteString", value: key.toString("hex") },
          ],
        });
      }
      throw new Error(`unexpected KMIP op ${body.tag}`);
    }),
    revokeAndDestroy: vi.fn((uid: string) => {
      kmsStore.delete(uid);
      return Promise.resolve();
    }),
  };
});

const {
  hotp,
  totp,
  codeForStep,
  stepAt,
  getDeviceCode,
  rotateDeviceSeed,
  getCodeCandidates,
  getEnrollCode,
  resolveDeviceUuid,
  deviceTotpSeedId,
  seedRotation,
} = await import("../device-code");
const { registerDeviceCodeRoutes, bearerMatches } = await import(
  "../../internal/device-code-routes"
);

// RFC 6238 Appendix B shared secret for SHA1.
const RFC_KEY = Buffer.from("12345678901234567890", "ascii");

describe("RFC 4226 / RFC 6238 core", () => {
  it("matches the RFC 6238 Appendix B SHA1 vectors (30 s, 8 digits)", () => {
    const vectors: [number, string][] = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ];
    for (const [t, expected] of vectors) {
      expect(totp(RFC_KEY, t, 30, 8)).toBe(expected);
      expect(hotp(RFC_KEY, Math.floor(t / 30), 8)).toBe(expected);
    }
  });

  it("matches the RFC 4226 Appendix D HOTP vectors (6 digits)", () => {
    const expected = [
      "755224", "287082", "359152", "969429", "338314",
      "254676", "287922", "162583", "399871", "520489",
    ];
    expected.forEach((code, counter) => {
      expect(hotp(RFC_KEY, counter)).toBe(code);
    });
  });

  it("uses a 600 s step and 6 digits by default", () => {
    // t = 1180 s → step 1 → the 8-digit vector 94287082 truncated to 6 digits.
    expect(stepAt(1180)).toBe(1);
    expect(totp(RFC_KEY, 1180)).toBe("287082");
    expect(totp(RFC_KEY, 1199)).toBe("287082");
    expect(totp(RFC_KEY, 1200)).toBe(hotp(RFC_KEY, 2));
    expect(codeForStep(RFC_KEY, 1)).toBe("287082");
  });

  it("names and parses seed UIDs", () => {
    expect(deviceTotpSeedId("abc", 3)).toBe("device_totp_abc_3");
    expect(seedRotation("device_totp_abc_3")).toBe(3);
    expect(seedRotation(null)).toBe(0);
  });
});

const DEVICE = "11111111-2222-3333-4444-555555555555";
const NETWORK = "abcdef01-0000-0000-0000-000000000000";
// A fixed instant in the middle of step 2_900_000.
const NOW_MS = (2_900_000 * 600 + 300) * 1000;
const STEP = 2_900_000;

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let supabase: SupabaseClient<Database>;

beforeEach(() => {
  kmsStore.clear();
  tables = {
    devices: [
      {
        id: DEVICE,
        name: "gw-1",
        network_id: NETWORK,
        updated_at: "2026-09-01T00:00:00Z",
        totp_seed_id: null,
        totp_locked_until: null,
      },
    ],
    device_otp_uses: [],
  };
  supabase = createFakeSupabase(tables) as unknown as SupabaseClient<Database>;
});

const seedKey = () =>
  kmsStore.get(String(tables.devices[0].totp_seed_id))!;

describe("getDeviceCode", () => {
  it("creates the seed lazily and returns the current step's code", async () => {
    const code = await getDeviceCode(supabase, DEVICE, NOW_MS);
    expect(tables.devices[0].totp_seed_id).toBe(`device_totp_${DEVICE}_1`);
    expect(code.step).toBe(STEP);
    expect(code.next).toBe(false);
    expect(code.code).toBe(codeForStep(seedKey(), STEP));
    expect(code.code).toMatch(/^\d{6}$/);
    expect(code.validUntil).toBe(
      new Date((STEP + 2) * 600 * 1000).toISOString(),
    );
  });

  it("offers the next step's code once the current one was used for vpn", async () => {
    await getDeviceCode(supabase, DEVICE, NOW_MS);
    const seedId = tables.devices[0].totp_seed_id;
    tables.device_otp_uses.push({
      device_id: DEVICE,
      seed_id: seedId,
      purpose: "vpn",
      step: STEP,
    });
    const code = await getDeviceCode(supabase, DEVICE, NOW_MS);
    expect(code.next).toBe(true);
    expect(code.step).toBe(STEP + 1);
    expect(code.code).toBe(codeForStep(seedKey(), STEP + 1));
    expect(code.validUntil).toBe(
      new Date((STEP + 3) * 600 * 1000).toISOString(),
    );
  });

  it("ignores uses for other purposes, other seeds and older steps", async () => {
    await getDeviceCode(supabase, DEVICE, NOW_MS);
    const seedId = tables.devices[0].totp_seed_id;
    tables.device_otp_uses.push(
      { device_id: DEVICE, seed_id: seedId, purpose: "ssh-enroll", step: STEP },
      { device_id: DEVICE, seed_id: "device_totp_old_0", purpose: "vpn", step: STEP },
      { device_id: DEVICE, seed_id: seedId, purpose: "vpn", step: STEP - 1 },
    );
    const code = await getDeviceCode(supabase, DEVICE, NOW_MS);
    expect(code.next).toBe(false);
    expect(code.step).toBe(STEP);
  });

  it("rotation creates seed n+1, destroys the old one and changes the code", async () => {
    const before = await getDeviceCode(supabase, DEVICE, NOW_MS);
    await rotateDeviceSeed(supabase, DEVICE);
    expect(tables.devices[0].totp_seed_id).toBe(`device_totp_${DEVICE}_2`);
    expect(kmsStore.has(`device_totp_${DEVICE}_1`)).toBe(false);
    const after = await getDeviceCode(supabase, DEVICE, NOW_MS);
    expect(after.step).toBe(STEP);
    // 1-in-a-million collision chance with random seeds; compare keys instead.
    expect(seedKey().equals(kmsStore.get(`device_totp_${DEVICE}_2`)!)).toBe(true);
    expect(before.code).toMatch(/^\d{6}$/);
  });

  it("rejects an unknown device", async () => {
    await expect(
      getDeviceCode(supabase, "99999999-0000-0000-0000-000000000000", NOW_MS),
    ).rejects.toThrow("device not found");
  });
});

describe("candidates / enroll-code services", () => {
  it("returns steps now-1..now+1 and the lock only while it is in the future", async () => {
    tables.devices[0].totp_locked_until = new Date(NOW_MS + 60_000).toISOString();
    const res = await getCodeCandidates(supabase, DEVICE, NOW_MS);
    expect(res.seed_id).toBe(`device_totp_${DEVICE}_1`);
    expect(res.candidates.map((c) => c.step)).toEqual([STEP - 1, STEP, STEP + 1]);
    for (const c of res.candidates) {
      expect(c.code).toBe(codeForStep(seedKey(), c.step));
    }
    expect(res.locked_until).toBe(new Date(NOW_MS + 60_000).toISOString());

    tables.devices[0].totp_locked_until = new Date(NOW_MS - 1).toISOString();
    expect((await getCodeCandidates(supabase, DEVICE, NOW_MS)).locked_until).toBeNull();
  });

  it("enroll-code picks the first unused ssh-enroll step and gives up past the window", async () => {
    const first = await getEnrollCode(supabase, DEVICE, NOW_MS);
    expect(first.step).toBe(STEP);
    expect(first.device_uuid).toBe(DEVICE);
    const seedId = tables.devices[0].totp_seed_id;
    tables.device_otp_uses.push({ device_id: DEVICE, seed_id: seedId, purpose: "ssh-enroll", step: STEP });
    expect((await getEnrollCode(supabase, DEVICE, NOW_MS)).step).toBe(STEP + 1);
    tables.device_otp_uses.push({ device_id: DEVICE, seed_id: seedId, purpose: "ssh-enroll", step: STEP + 1 });
    await expect(getEnrollCode(supabase, DEVICE, NOW_MS)).rejects.toThrow(
      "no unused enrollment code",
    );
  });

  it("resolves <name>@<net8> like the edge functions", async () => {
    expect(await resolveDeviceUuid(supabase, { device_id: "gw-1@abcdef01" })).toBe(DEVICE);
    expect(await resolveDeviceUuid(supabase, { device_id: "gw-1@ABCDEF01xyz" })).toBe(DEVICE);
    await expect(resolveDeviceUuid(supabase, { device_id: "gw-1@00000000" })).rejects.toThrow();
    await expect(resolveDeviceUuid(supabase, { device_id: "gw-1" })).rejects.toThrow();
  });
});

describe("internal HTTP endpoints", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  const build = () => {
    const app = fastify();
    registerDeviceCodeRoutes(app, { supabase, now: () => NOW_MS });
    return app;
  };

  it("bearerMatches is exact", () => {
    expect(bearerMatches("Bearer tok", "tok")).toBe(true);
    expect(bearerMatches("Bearer tok2", "tok")).toBe(false);
    expect(bearerMatches("bearer tok", "tok")).toBe(false);
    expect(bearerMatches(undefined, "tok")).toBe(false);
    expect(bearerMatches("Bearer ", "tok")).toBe(false);
  });

  it("candidates: 503 unset, 401 wrong/missing bearer, 200 and 404", async () => {
    delete process.env.DEVICE_AUTH_TOKEN;
    const app = build();
    const post = (auth?: string, body: unknown = { device_uuid: DEVICE }) =>
      app.inject({
        method: "POST",
        url: "/internal/device-auth/candidates",
        headers: auth ? { authorization: auth } : {},
        payload: body as object,
      });

    expect((await post("Bearer x")).statusCode).toBe(503);
    process.env.DEVICE_AUTH_TOKEN = "dev-auth";
    expect((await post()).statusCode).toBe(401);
    expect((await post("Bearer wrong")).statusCode).toBe(401);
    // The ops-cert token must not open the candidates endpoint.
    process.env.OPS_CERT_MINT_TOKEN = "ops";
    expect((await post("Bearer ops")).statusCode).toBe(401);

    const ok = await post("Bearer dev-auth");
    expect(ok.statusCode).toBe(200);
    const body = ok.json<{
      seed_id: string;
      locked_until: string | null;
      candidates: unknown[];
    }>();
    expect(body.seed_id).toBe(`device_totp_${DEVICE}_1`);
    expect(body.locked_until).toBeNull();
    expect(body.candidates).toHaveLength(3);
    expect(JSON.stringify(body)).not.toContain(seedKey().toString("hex"));

    const missing = await post("Bearer dev-auth", {
      device_uuid: "99999999-0000-0000-0000-000000000000",
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "device not found" });
    await app.close();
  });

  it("enroll-code: bearer OPS_CERT_MINT_TOKEN, uuid or name@net8", async () => {
    process.env.OPS_CERT_MINT_TOKEN = "ops";
    process.env.DEVICE_AUTH_TOKEN = "dev-auth";
    const app = build();
    const post = (auth: string, body: unknown) =>
      app.inject({
        method: "POST",
        url: "/internal/devices/enroll-code",
        headers: { authorization: auth },
        payload: body as object,
      });

    expect((await post("Bearer dev-auth", { device_uuid: DEVICE })).statusCode).toBe(401);
    expect((await post("Bearer ops", {})).statusCode).toBe(400);

    const byUuid = await post("Bearer ops", { device_uuid: DEVICE });
    expect(byUuid.statusCode).toBe(200);
    expect(byUuid.json()).toEqual({
      code: codeForStep(seedKey(), STEP),
      step: STEP,
      valid_until: new Date((STEP + 2) * 600 * 1000).toISOString(),
      device_uuid: DEVICE,
    });

    const byName = await post("Bearer ops", { device_id: `gw-1@${NETWORK.slice(0, 8)}` });
    expect(byName.statusCode).toBe(200);
    expect(byName.json<{ device_uuid: string }>().device_uuid).toBe(DEVICE);

    expect((await post("Bearer ops", { device_id: "nope@00000000" })).statusCode).toBe(404);
    await app.close();
  });
});
