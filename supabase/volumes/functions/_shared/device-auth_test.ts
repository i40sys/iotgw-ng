// Unit tests for `_shared/device-auth.ts` (task-132.04 / decision-033).
//
// Run: deno test --allow-env supabase/volumes/functions/_shared/device-auth_test.ts
//
// `fetch` is monkey-patched per test (no real network / no real Supabase or
// backend) and restored in a `finally`. Env vars are set per test for the
// same reason — nothing here talks to a live cluster.

import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.177.1/testing/asserts.ts";
import {
  authenticateDevice,
  bytesToBase64,
  base64ToBytes,
  encryptPayload,
  decryptPayload,
  sealVpnReply,
  withinTimeWindow,
  type DeviceAuthSuccess,
} from "./device-auth.ts";

function setTestEnv() {
  Deno.env.set("SUPABASE_URL", "http://rest.test.local");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  Deno.env.set("DEVICE_AUTH_TOKEN", "test-device-auth-token");
  Deno.env.set("IOTGW_BACKEND_URL", "http://backend.test.local");
}

// ── sealVpnReply ─────────────────────────────────────────────────────────

Deno.test("sealVpnReply - round trip decrypts with the recipient's private key", async () => {
  const recipient = (await crypto.subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const replyKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", recipient.publicKey),
  );
  const replyKeyB64 = bytesToBase64(replyKeyBytes);
  const deviceId = "11111111-1111-1111-1111-111111111111";
  const plaintext = "[Interface]\nPrivateKey = super-secret\n";

  const sealed = await sealVpnReply(plaintext, replyKeyB64, deviceId);
  assertEquals(sealed.v, 1);
  assertEquals(sealed.alg, "X25519-HKDF-SHA256-A256GCM");

  // Manually unseal using the recipient's private key, mirroring what a
  // client (the Go gateway) does.
  const epkBytes = base64ToBytes(sealed.epk);
  const ephemeralPublicKey = await crypto.subtle.importKey(
    "raw",
    epkBytes,
    { name: "X25519" },
    true,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "X25519", public: ephemeralPublicKey },
      recipient.privateKey,
      256,
    ),
  );
  const salt = new Uint8Array(64);
  salt.set(epkBytes, 0);
  salt.set(replyKeyBytes, 32);
  const hkdfKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
  const aesKeyBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode("iotgw-vpn-reply v1"),
    },
    hkdfKey,
    256,
  );
  const aesKey = await crypto.subtle.importKey("raw", aesKeyBits, { name: "AES-GCM" }, false, [
    "decrypt",
  ]);
  const opened = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(sealed.nonce),
      additionalData: new TextEncoder().encode(deviceId),
    },
    aesKey,
    base64ToBytes(sealed.ct),
  );
  assertEquals(new TextDecoder().decode(opened), plaintext);
});

Deno.test("sealVpnReply - wrong AAD (device id) fails to decrypt", async () => {
  const recipient = (await crypto.subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const replyKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", recipient.publicKey),
  );
  const replyKeyB64 = bytesToBase64(replyKeyBytes);
  const deviceId = "11111111-1111-1111-1111-111111111111";
  const plaintext = "top secret wireguard config";

  const sealed = await sealVpnReply(plaintext, replyKeyB64, deviceId);

  const epkBytes = base64ToBytes(sealed.epk);
  const ephemeralPublicKey = await crypto.subtle.importKey(
    "raw",
    epkBytes,
    { name: "X25519" },
    true,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "X25519", public: ephemeralPublicKey },
      recipient.privateKey,
      256,
    ),
  );
  const salt = new Uint8Array(64);
  salt.set(epkBytes, 0);
  salt.set(replyKeyBytes, 32);
  const hkdfKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
  const aesKeyBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode("iotgw-vpn-reply v1"),
    },
    hkdfKey,
    256,
  );
  const aesKey = await crypto.subtle.importKey("raw", aesKeyBits, { name: "AES-GCM" }, false, [
    "decrypt",
  ]);

  await assertRejects(() =>
    crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(sealed.nonce),
        // Wrong AAD — a different device id than the one it was sealed with.
        additionalData: new TextEncoder().encode("22222222-2222-2222-2222-222222222222"),
      },
      aesKey,
      base64ToBytes(sealed.ct),
    )
  );
});

Deno.test("sealVpnReply - rejects a reply_key that is not 32 bytes", async () => {
  await assertRejects(
    () => sealVpnReply("x", bytesToBase64(new Uint8Array(16)), "device"),
    Error,
    "32-byte",
  );
});

// ── withinTimeWindow ─────────────────────────────────────────────────────

Deno.test("withinTimeWindow - accepts now, rejects stale", () => {
  const now = 1_758_800_000;
  assert(withinTimeWindow(now, 300, now));
  assert(withinTimeWindow(now - 300, 300, now));
  assert(withinTimeWindow(now + 300, 300, now));
  assert(!withinTimeWindow(now - 301, 300, now));
  assert(!withinTimeWindow(now + 400, 300, now));
});

// ── authenticateDevice ───────────────────────────────────────────────────

const DEVICE_UUID = "11111111-1111-1111-1111-111111111111";
const SEED_ID = "device_totp_11111111-1111-1111-1111-111111111111_1";

Deno.test("authenticateDevice - locked out returns 429", async () => {
  setTestEnv();
  const future = new Date(Date.now() + 60_000).toISOString();
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/internal/device-auth/candidates")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ seed_id: SEED_ID, locked_until: future, candidates: [] }),
          { status: 200 },
        ),
      );
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;

  try {
    const result = await authenticateDevice(new Uint8Array(32), DEVICE_UUID, "vpn");
    assert(result instanceof Response);
    assertEquals(result.status, 429);
    const body = await result.json();
    assertEquals(body.error, "too many failed codes; try again later");
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("authenticateDevice - wrong code records a failure and returns 401", async () => {
  setTestEnv();
  const encrypted = await encryptPayload("{}", "999999"); // not one of the candidates below

  let failureRecorded = false;
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/internal/device-auth/candidates")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            seed_id: SEED_ID,
            locked_until: null,
            candidates: [
              { step: 100, code: "111111" },
              { step: 101, code: "222222" },
              { step: 102, code: "333333" },
            ],
          }),
          { status: 200 },
        ),
      );
    }
    if (url.endsWith("/rest/v1/rpc/record_device_otp_failure")) {
      failureRecorded = true;
      return Promise.resolve(new Response(JSON.stringify(null), { status: 200 }));
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;

  try {
    const result = await authenticateDevice(encrypted, DEVICE_UUID, "vpn");
    assert(result instanceof Response);
    assertEquals(result.status, 401);
    const body = await result.json();
    assertEquals(body.error, "Authentication failed");
    assert(failureRecorded, "record_device_otp_failure should have been called");
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("authenticateDevice - already-used code (consume returns false) is 401", async () => {
  setTestEnv();
  const code = "222222";
  const step = 101;
  const encrypted = await encryptPayload(JSON.stringify({ hello: "world" }), code);

  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/internal/device-auth/candidates")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            seed_id: SEED_ID,
            locked_until: null,
            candidates: [
              { step: 100, code: "111111" },
              { step, code },
              { step: 102, code: "333333" },
            ],
          }),
          { status: 200 },
        ),
      );
    }
    if (url.endsWith("/rest/v1/rpc/consume_device_otp")) {
      return Promise.resolve(new Response(JSON.stringify(false), { status: 200 }));
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;

  try {
    const result = await authenticateDevice(encrypted, DEVICE_UUID, "vpn");
    assert(result instanceof Response);
    assertEquals(result.status, 401);
    const body = await result.json();
    assertEquals(body.error, "code already used — get a new code from the UI");
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("authenticateDevice - success calls consume with the matched step/purpose/seed", async () => {
  setTestEnv();
  const code = "333333";
  const step = 102;
  const plaintext = JSON.stringify({ device_id: "iotgw-t1@aaaaaaaa" });
  const encrypted = await encryptPayload(plaintext, code);

  const consumeCalls: unknown[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/internal/device-auth/candidates")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            seed_id: SEED_ID,
            locked_until: null,
            candidates: [
              { step: 100, code: "111111" },
              { step: 101, code: "222222" },
              { step, code },
            ],
          }),
          { status: 200 },
        ),
      );
    }
    if (url.endsWith("/rest/v1/rpc/consume_device_otp")) {
      consumeCalls.push(JSON.parse(init!.body as string));
      return Promise.resolve(new Response(JSON.stringify(true), { status: 200 }));
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;

  try {
    const result = await authenticateDevice(encrypted, DEVICE_UUID, "vpn");
    assert(!(result instanceof Response), "expected a success object, not a Response");
    const success = result as DeviceAuthSuccess;
    assertEquals(success.plaintext, plaintext);
    assertEquals(success.code, code);
    assertEquals(success.step, step);
    assertEquals(consumeCalls, [
      { p_device_id: DEVICE_UUID, p_seed_id: SEED_ID, p_purpose: "vpn", p_step: step },
    ]);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("authenticateDevice - device-not-found (404) from the backend is a generic 401", async () => {
  setTestEnv();
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/internal/device-auth/candidates")) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: "device not found" }), { status: 404 }),
      );
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;

  try {
    const result = await authenticateDevice(new Uint8Array(32), DEVICE_UUID, "vpn");
    assert(result instanceof Response);
    assertEquals(result.status, 401);
    const body = await result.json();
    // Deliberately generic — must not leak "device not found" to a prober.
    assertEquals(body.error, "Authentication failed");
  } finally {
    globalThis.fetch = original;
  }
});

// Sanity check that decryptPayload/encryptPayload are still exported and
// round-trip (the OpenSSL-compatible envelope primitives this file is built on).
Deno.test("encryptPayload/decryptPayload - round trip", async () => {
  const plaintext = "hello device";
  const password = "123456";
  const encrypted = await encryptPayload(plaintext, password);
  const decrypted = await decryptPayload(encrypted, password);
  assertEquals(decrypted, plaintext);
});
