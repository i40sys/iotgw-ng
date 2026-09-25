// Unit tests for `vpn/index.ts` (task-134/135, decision-033 §4 + decision-035
// §2). `handleVpnRequest` is exercised directly (no real HTTP listener —
// `serve()` only runs when this file is the Deno entry point, guarded by
// `import.meta.main`). All I/O is a monkey-patched `globalThis.fetch`
// covering the four external calls the handler can make:
//   - PostgREST device lookup   (GET  .../rest/v1/devices?...)
//   - backend candidate codes   (POST .../internal/device-auth/candidates)
//   - PostgREST RPCs            (POST .../rest/v1/rpc/consume_device_otp,
//                                      .../rest/v1/rpc/record_device_otp_failure)
//   - Netmaker extclient update (GET/PUT .../api/extclients/{network}/{id})
//   - PostgREST device write-back (PATCH .../rest/v1/devices?id=eq....)
//
// REQUIRED ENV (read at module import time by vpn/index.ts — must already be
// set in the process environment before `deno test` starts; setting them
// from inside this file is too late because ES module dependency evaluation
// runs `index.ts`'s top-level code before this file's own top-level code):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NETMAKER_BASE_URL,
//   NETMAKER_MASTER_KEY
//
// Run:
//   SUPABASE_URL=http://rest.test.local \
//   SUPABASE_SERVICE_ROLE_KEY=test-service-role-key \
//   NETMAKER_BASE_URL=http://netmaker.test.local \
//   NETMAKER_MASTER_KEY=test-netmaker-key \
//   deno test --allow-env supabase/volumes/functions/vpn/index_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.177.1/testing/asserts.ts";
import {
  base64ToBytes,
  bytesToBase64,
  encryptPayload,
  type SealedVpnReply,
} from "../_shared/device-auth.ts";
import { handleVpnRequest } from "./index.ts";

function setTestEnv() {
  // Read lazily by _shared/device-auth.ts — safe to set per-test.
  Deno.env.set("DEVICE_AUTH_TOKEN", "test-device-auth-token");
  Deno.env.set("IOTGW_BACKEND_URL", "http://backend.test.local");
}

const DEVICE_UUID = "22222222-2222-2222-2222-222222222222";
const NETWORK_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const NETWORK_PREFIX = NETWORK_UUID.slice(0, 8);
const DEVICE_WIRE_ID = `iotgw-test@${NETWORK_PREFIX}`;
const SEED_ID = `device_totp_${DEVICE_UUID}_1`;

const CURRENT_PUBLIC_KEY_B64 = bytesToBase64(new Uint8Array(32).fill(1));
const NEW_PUBLIC_KEY_B64 = bytesToBase64(new Uint8Array(32).fill(2));
const SERVER_HELD_PRIVATE_KEY = "server-held-private-key-base64";

function makeDeviceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DEVICE_UUID,
    network_id: NETWORK_UUID,
    name: "iotgw-test",
    description: null,
    ip_address: "10.121.0.5",
    private_key: SERVER_HELD_PRIVATE_KEY,
    public_key: CURRENT_PUBLIC_KEY_B64,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    network: { id: NETWORK_UUID, ipv4_cidr: "10.121.0.0/24" },
    ...overrides,
  };
}

const CODE = "555555";
const STEP = 42;

function defaultCandidates() {
  return {
    seed_id: SEED_ID,
    locked_until: null as string | null,
    candidates: [{ step: STEP, code: CODE }],
  };
}

interface MockOpts {
  deviceRow?: Record<string, unknown> | null;
  candidates?: ReturnType<typeof defaultCandidates>;
  consumeOtp?: boolean;
  netmakerExtclient?: Record<string, unknown> | null;
  netmakerGetStatus?: number;
  netmakerPutStatus?: number;
  patchStatus?: number;
}

interface MockState {
  netmakerGetCalls: number;
  netmakerPutCalls: number;
  netmakerPutBody?: Record<string, unknown>;
  patchCalls: number;
  patchBody?: Record<string, unknown>;
  recordFailureCalled: boolean;
}

function installMockFetch(opts: MockOpts): { state: MockState; restore: () => void } {
  const original = globalThis.fetch;
  const state: MockState = {
    netmakerGetCalls: 0,
    netmakerPutCalls: 0,
    patchCalls: 0,
    recordFailureCalled: false,
  };
  const deviceRow = opts.deviceRow === undefined ? makeDeviceRow() : opts.deviceRow;
  const candidates = opts.candidates ?? defaultCandidates();

  globalThis.fetch = (((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("/rest/v1/devices") && method === "GET") {
      return Promise.resolve(
        new Response(JSON.stringify(deviceRow ? [deviceRow] : []), { status: 200 }),
      );
    }
    if (url.endsWith("/internal/device-auth/candidates")) {
      return Promise.resolve(new Response(JSON.stringify(candidates), { status: 200 }));
    }
    if (url.endsWith("/rest/v1/rpc/consume_device_otp")) {
      return Promise.resolve(
        new Response(JSON.stringify(opts.consumeOtp ?? true), { status: 200 }),
      );
    }
    if (url.endsWith("/rest/v1/rpc/record_device_otp_failure")) {
      state.recordFailureCalled = true;
      return Promise.resolve(new Response(JSON.stringify(null), { status: 200 }));
    }
    if (url.includes("/api/extclients/") && method === "GET") {
      state.netmakerGetCalls++;
      if (opts.netmakerGetStatus && opts.netmakerGetStatus !== 200) {
        return Promise.resolve(
          new Response(JSON.stringify({ Message: "boom" }), { status: opts.netmakerGetStatus }),
        );
      }
      if (!opts.netmakerExtclient) {
        return Promise.resolve(new Response("", { status: 404 }));
      }
      return Promise.resolve(new Response(JSON.stringify(opts.netmakerExtclient), { status: 200 }));
    }
    if (url.includes("/api/extclients/") && method === "PUT") {
      state.netmakerPutCalls++;
      state.netmakerPutBody = init?.body ? JSON.parse(init.body as string) : undefined;
      if (opts.netmakerPutStatus && opts.netmakerPutStatus !== 200) {
        return Promise.resolve(
          new Response(JSON.stringify({ Message: "boom" }), { status: opts.netmakerPutStatus }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }
    if (url.includes("/rest/v1/devices?id=eq.") && method === "PATCH") {
      state.patchCalls++;
      state.patchBody = init?.body ? JSON.parse(init.body as string) : undefined;
      if (opts.patchStatus && opts.patchStatus !== 200) {
        return Promise.resolve(new Response("patch failed", { status: opts.patchStatus }));
      }
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  }) as typeof fetch);

  return { state, restore: () => (globalThis.fetch = original) };
}

async function generateReplyKeyPair(): Promise<{ keyPair: CryptoKeyPair; replyKeyB64: string }> {
  const keyPair = (await crypto.subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const pubBytes = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  return { keyPair, replyKeyB64: bytesToBase64(pubBytes) };
}

async function unsealReply(
  sealed: SealedVpnReply,
  recipientKeyPair: CryptoKeyPair,
  deviceId: string,
): Promise<string> {
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
      recipientKeyPair.privateKey,
      256,
    ),
  );
  const replyKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", recipientKeyPair.publicKey),
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
  return new TextDecoder().decode(opened);
}

function buildRequest(body?: Uint8Array, deviceId: string = DEVICE_WIRE_ID): Request {
  const url = `http://localhost/vpn?device_id=${encodeURIComponent(deviceId)}`;
  return new Request(url, {
    method: "POST",
    body: body ? (body as unknown as BodyInit) : undefined,
  });
}

async function encryptedPayload(payload: Record<string, unknown>): Promise<Uint8Array> {
  return await encryptPayload(JSON.stringify(payload), CODE);
}

// ── basic request validation (no fetch needed — returns before any I/O) ───

Deno.test("handleVpnRequest - 400 when device_id query param missing", async () => {
  const res = await handleVpnRequest(new Request("http://localhost/vpn", { method: "POST" }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "device_id query parameter is required");
});

// ── device lookup / early guards ───────────────────────────────────────────

Deno.test("handleVpnRequest - 400 when device row has no public_key", async () => {
  setTestEnv();
  const { restore } = installMockFetch({ deviceRow: makeDeviceRow({ public_key: null }) });
  try {
    const res = await handleVpnRequest(buildRequest());
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "Unable to fetch device keys");
  } finally {
    restore();
  }
});

Deno.test("handleVpnRequest - 400 when request body is empty", async () => {
  setTestEnv();
  const { restore } = installMockFetch({});
  try {
    const res = await handleVpnRequest(buildRequest(new Uint8Array(0)));
    assertEquals(res.status, 400);
    const body = await res.json();
    assert(body.error.includes("Request body is required"));
  } finally {
    restore();
  }
});

Deno.test("handleVpnRequest - 400 when request body is too small", async () => {
  setTestEnv();
  const { restore } = installMockFetch({});
  try {
    const res = await handleVpnRequest(buildRequest(new Uint8Array(4)));
    assertEquals(res.status, 400);
    const body = await res.json();
    assert(body.error.includes("too small"));
  } finally {
    restore();
  }
});

// ── authentication ──────────────────────────────────────────────────────

Deno.test("handleVpnRequest - 401 and records a failure on wrong code", async () => {
  setTestEnv();
  const { state, restore } = installMockFetch({});
  try {
    const encrypted = await encryptPayload("{}", "999999"); // not the candidate code
    const res = await handleVpnRequest(buildRequest(encrypted));
    assertEquals(res.status, 401);
    assert(state.recordFailureCalled);
  } finally {
    restore();
  }
});

// ── task-135: reply_key is mandatory ───────────────────────────────────────

Deno.test("handleVpnRequest - 426 when reply_key is missing", async () => {
  setTestEnv();
  const { restore } = installMockFetch({});
  try {
    const encrypted = await encryptedPayload({ device_id: DEVICE_WIRE_ID });
    const res = await handleVpnRequest(buildRequest(encrypted));
    assertEquals(res.status, 426);
    const body = await res.json();
    assertEquals(body.error, "upgrade required: send reply_key (iotgw agent >= v0.3.0)");
  } finally {
    restore();
  }
});

Deno.test("handleVpnRequest - 400 when reply_key is not base64 of 32 bytes", async () => {
  setTestEnv();
  const { restore } = installMockFetch({});
  try {
    const encrypted = await encryptedPayload({
      device_id: DEVICE_WIRE_ID,
      reply_key: bytesToBase64(new Uint8Array(16)),
    });
    const res = await handleVpnRequest(buildRequest(encrypted));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "Invalid reply_key");
  } finally {
    restore();
  }
});

// ── decision-035 §2: gateway-held WireGuard key ────────────────────────────

Deno.test("handleVpnRequest - 400 when wg_public_key is not base64 of 32 bytes", async () => {
  setTestEnv();
  const { keyPair: _kp, replyKeyB64 } = await generateReplyKeyPair();
  const { state, restore } = installMockFetch({});
  try {
    const encrypted = await encryptedPayload({
      device_id: DEVICE_WIRE_ID,
      reply_key: replyKeyB64,
      wg_public_key: "not-valid-base64!!",
    });
    const res = await handleVpnRequest(buildRequest(encrypted));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "Invalid wg_public_key");
    assertEquals(state.netmakerGetCalls, 0);
    assertEquals(state.patchCalls, 0);
  } finally {
    restore();
  }
});

Deno.test("handleVpnRequest - 409 when no wg_public_key and private_key is already null", async () => {
  setTestEnv();
  const { keyPair: _kp, replyKeyB64 } = await generateReplyKeyPair();
  const { state, restore } = installMockFetch({
    deviceRow: makeDeviceRow({ private_key: null }),
  });
  try {
    const encrypted = await encryptedPayload({ device_id: DEVICE_WIRE_ID, reply_key: replyKeyB64 });
    const res = await handleVpnRequest(buildRequest(encrypted));
    assertEquals(res.status, 409);
    const body = await res.json();
    assertEquals(
      body.error,
      "this device's WireGuard key is held by the gateway; update the gateway agent",
    );
    assertEquals(state.netmakerGetCalls, 0);
    assertEquals(state.patchCalls, 0);
  } finally {
    restore();
  }
});

Deno.test("handleVpnRequest - legacy path (no wg_public_key, private_key present) returns the server-held key", async () => {
  setTestEnv();
  const { keyPair, replyKeyB64 } = await generateReplyKeyPair();
  const { state, restore } = installMockFetch({});
  try {
    const encrypted = await encryptedPayload({ device_id: DEVICE_WIRE_ID, reply_key: replyKeyB64 });
    const res = await handleVpnRequest(buildRequest(encrypted));
    assertEquals(res.status, 200);
    const sealed = (await res.json()) as SealedVpnReply;
    const plaintext = await unsealReply(sealed, keyPair, DEVICE_WIRE_ID);
    assert(plaintext.includes(`PrivateKey = ${SERVER_HELD_PRIVATE_KEY}`));
    assert(!plaintext.includes("held by the gateway"));
    assertEquals(state.netmakerGetCalls, 0);
    assertEquals(state.netmakerPutCalls, 0);
    assertEquals(state.patchCalls, 0);
  } finally {
    restore();
  }
});

Deno.test("handleVpnRequest - wg_public_key changed: updates Netmaker, writes back, omits PrivateKey", async () => {
  setTestEnv();
  const { keyPair, replyKeyB64 } = await generateReplyKeyPair();
  const extclient = {
    clientid: DEVICE_UUID.replaceAll("-", ""),
    publickey: CURRENT_PUBLIC_KEY_B64,
    privatekey: "netmaker-private-key-not-used",
    dns: "1.1.1.1",
    extraallowedips: ["10.0.0.0/24"],
    enabled: true,
    deniednodeacls: [],
    postup: "echo up",
    postdown: "echo down",
    tags: ["iotgw"],
    remote_access_client_id: "rac-123",
  };
  const { state, restore } = installMockFetch({ netmakerExtclient: extclient });
  try {
    const encrypted = await encryptedPayload({
      device_id: DEVICE_WIRE_ID,
      reply_key: replyKeyB64,
      wg_public_key: NEW_PUBLIC_KEY_B64,
    });
    const res = await handleVpnRequest(buildRequest(encrypted));
    assertEquals(res.status, 200);

    assertEquals(state.netmakerGetCalls, 1);
    assertEquals(state.netmakerPutCalls, 1);
    assertEquals(state.netmakerPutBody?.publickey, NEW_PUBLIC_KEY_B64);
    assertEquals(state.netmakerPutBody?.dns, extclient.dns);
    assertEquals(state.netmakerPutBody?.remote_access_client_id, extclient.remote_access_client_id);
    // The Netmaker-returned privatekey must never be echoed back into the PUT.
    assertEquals("privatekey" in (state.netmakerPutBody ?? {}), false);

    assertEquals(state.patchCalls, 1);
    assertEquals(state.patchBody, { public_key: NEW_PUBLIC_KEY_B64, private_key: null });

    const sealed = (await res.json()) as SealedVpnReply;
    const plaintext = await unsealReply(sealed, keyPair, DEVICE_WIRE_ID);
    assert(plaintext.includes("# PrivateKey: held by the gateway"));
    assert(!plaintext.includes("PrivateKey ="));
    assert(plaintext.includes(`# DevicePublicKey = ${NEW_PUBLIC_KEY_B64}`));
  } finally {
    restore();
  }
});

Deno.test("handleVpnRequest - wg_public_key equal to current: no Netmaker call, still writes back and omits PrivateKey", async () => {
  setTestEnv();
  const { keyPair, replyKeyB64 } = await generateReplyKeyPair();
  const { state, restore } = installMockFetch({}); // deviceRow.public_key === CURRENT_PUBLIC_KEY_B64
  try {
    const encrypted = await encryptedPayload({
      device_id: DEVICE_WIRE_ID,
      reply_key: replyKeyB64,
      wg_public_key: CURRENT_PUBLIC_KEY_B64,
    });
    const res = await handleVpnRequest(buildRequest(encrypted));
    assertEquals(res.status, 200);

    assertEquals(state.netmakerGetCalls, 0);
    assertEquals(state.netmakerPutCalls, 0);
    assertEquals(state.patchCalls, 1);
    assertEquals(state.patchBody, { public_key: CURRENT_PUBLIC_KEY_B64, private_key: null });

    const sealed = (await res.json()) as SealedVpnReply;
    const plaintext = await unsealReply(sealed, keyPair, DEVICE_WIRE_ID);
    assert(plaintext.includes("# PrivateKey: held by the gateway"));
    assert(!plaintext.includes("PrivateKey ="));
  } finally {
    restore();
  }
});

Deno.test("handleVpnRequest - Netmaker failure returns 502 without touching the DB", async () => {
  setTestEnv();
  const { keyPair: _kp, replyKeyB64 } = await generateReplyKeyPair();
  const { state, restore } = installMockFetch({ netmakerGetStatus: 500 });
  try {
    const encrypted = await encryptedPayload({
      device_id: DEVICE_WIRE_ID,
      reply_key: replyKeyB64,
      wg_public_key: NEW_PUBLIC_KEY_B64,
    });
    const res = await handleVpnRequest(buildRequest(encrypted));
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(body.error, "Failed to update WireGuard key in Netmaker");
    assertEquals(state.patchCalls, 0);
  } finally {
    restore();
  }
});

Deno.test("handleVpnRequest - DB write-back failure after Netmaker success still returns 200", async () => {
  setTestEnv();
  const { keyPair, replyKeyB64 } = await generateReplyKeyPair();
  const extclient = {
    clientid: DEVICE_UUID.replaceAll("-", ""),
    publickey: CURRENT_PUBLIC_KEY_B64,
    dns: null,
    extraallowedips: null,
    enabled: true,
    deniednodeacls: null,
    postup: "",
    postdown: "",
    tags: null,
    remote_access_client_id: null,
  };
  const originalConsoleError = console.error;
  console.error = () => {}; // this test deliberately triggers the "log loudly" path
  const { state, restore } = installMockFetch({
    netmakerExtclient: extclient,
    patchStatus: 500,
  });
  try {
    const encrypted = await encryptedPayload({
      device_id: DEVICE_WIRE_ID,
      reply_key: replyKeyB64,
      wg_public_key: NEW_PUBLIC_KEY_B64,
    });
    const res = await handleVpnRequest(buildRequest(encrypted));
    assertEquals(res.status, 200);
    assertEquals(state.netmakerPutCalls, 1);
    assertEquals(state.patchCalls, 1);

    const sealed = (await res.json()) as SealedVpnReply;
    const plaintext = await unsealReply(sealed, keyPair, DEVICE_WIRE_ID);
    assert(plaintext.includes("# PrivateKey: held by the gateway"));
    assert(plaintext.includes(`# DevicePublicKey = ${NEW_PUBLIC_KEY_B64}`));
  } finally {
    console.error = originalConsoleError;
    restore();
  }
});
