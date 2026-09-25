// Device authentication primitives shared by the `vpn` and `ssh-ca` edge
// functions (decision-033, superseding decision-009's browser/gateway-derived
// TOTP; see decision-024/decision-026 for the PKI side).
//
// A gateway no longer derives its own one-time code: the code is a random
// 256-bit-seed TOTP whose seed lives only in Cosmian KMS, read only by the
// iotgw-ui BACKEND. An edge function never sees the seed — it asks the
// backend's `/internal/device-auth/candidates` for the small set of codes
// that are valid *right now* (bearer `DEVICE_AUTH_TOKEN`), tries each against
// the request's OpenSSL envelope, and — on the first one that decrypts —
// consumes it via the `consume_device_otp` RPC so it can never be reused
// (decision-033 §1/§3).
//
// This file exists so `ssh-ca` uses *exactly* the same primitives as `vpn`: a
// silent divergence between two copies would either break enrollment or,
// worse, accept something the other would reject. See decision-025 §B.
//
// The request envelope is deliberately OpenSSL-compatible
// (`openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt`) so a gateway needs
// nothing but busybox + openssl to speak it. The VPN *reply* is no longer
// encrypted with the code (decision-033 §4) — see `sealVpnReply` below.

// ── OpenSSL-compatible AES-256-CBC envelope ────────────────────────────────

const PBKDF2_ITERATIONS = 300_000;
const SALTED_PREFIX = "Salted__";

async function deriveKeyAndIv(password: string, salt: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  // 48 bytes = 32 (AES-256 key) + 16 (CBC IV), exactly as OpenSSL derives them.
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      keyMaterial,
      48 * 8,
    ),
  );
  return { key: derived.slice(0, 32), iv: derived.slice(32, 48) };
}

/** Decrypt an `openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt` payload. */
export async function decryptPayload(
  encryptedData: Uint8Array,
  password: string,
): Promise<string> {
  try {
    if (
      encryptedData.length < 16 ||
      String.fromCharCode(...encryptedData.slice(0, 8)) !== SALTED_PREFIX
    ) {
      throw new Error("Invalid encrypted data format");
    }
    const { key, iv } = await deriveKeyAndIv(password, encryptedData.slice(8, 16));
    const aesKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "AES-CBC", length: 256 },
      false,
      ["decrypt"],
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv },
      aesKey,
      encryptedData.slice(16),
    );
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Decryption failed [${name}]: ${message}`);
  }
}

/** Encrypt in the same format, so the client can `openssl enc -d` the reply. */
export async function encryptPayload(
  plaintext: string,
  password: string,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(8));
  const { key, iv } = await deriveKeyAndIv(password, salt);
  const aesKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-CBC", length: 256 },
    false,
    ["encrypt"],
  );
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-CBC", iv },
      aesKey,
      new TextEncoder().encode(plaintext),
    ),
  );

  const out = new Uint8Array(8 + salt.length + encrypted.length);
  out.set(new TextEncoder().encode(SALTED_PREFIX), 0);
  out.set(salt, 8);
  out.set(encrypted, 8 + salt.length);
  return out;
}

// ── base64 helpers ──────────────────────────────────────────────────────────

export function base64ToBytes(s: string): Uint8Array {
  return Uint8Array.from(atob(s.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// ── the sealed VPN reply (decision-033 §4) ─────────────────────────────────
//
// The request still authenticates with the code envelope, but the reply — the
// device's WireGuard PRIVATE key — is sealed to a fresh X25519 key the
// gateway generated for this call (`reply_key` in the decrypted request),
// never to the (brute-forceable) 6-digit code. A recorded exchange over plain
// HTTP therefore yields the request but never the private key.
//
//   shared = X25519(ephemeral_priv, reply_key)
//   key    = HKDF-SHA256(ikm=shared, salt=epk‖reply_key (64 bytes),
//                         info="iotgw-vpn-reply v1", L=32)
//   ct     = AES-256-GCM(key, nonce, plaintext, AAD=utf8(device_id))  (incl. 16B tag)

export const VPN_REPLY_ALG = "X25519-HKDF-SHA256-A256GCM" as const;
const VPN_REPLY_HKDF_INFO = new TextEncoder().encode("iotgw-vpn-reply v1");

export interface SealedVpnReply {
  v: 1;
  alg: typeof VPN_REPLY_ALG;
  /** base64, 32-byte X25519 ephemeral public key. */
  epk: string;
  /** base64, 12-byte AES-GCM nonce. */
  nonce: string;
  /** base64, AES-256-GCM ciphertext with the 16-byte tag appended. */
  ct: string;
}

/**
 * `ephemeralKeyPair`/`nonce` are test-only injection points (never used by
 * production callers) so a deterministic interop vector can be generated for
 * a non-TypeScript client (e.g. the Go gateway) to verify against.
 */
export interface SealVpnReplyTestOverrides {
  ephemeralKeyPair?: CryptoKeyPair;
  nonce?: Uint8Array;
}

export async function sealVpnReply(
  plaintext: string,
  replyKeyB64: string,
  deviceId: string,
  testOverrides?: SealVpnReplyTestOverrides,
): Promise<SealedVpnReply> {
  const replyKeyBytes = base64ToBytes(replyKeyB64);
  if (replyKeyBytes.length !== 32) {
    throw new Error("reply_key must be a base64-encoded 32-byte X25519 public key");
  }
  const recipientPublicKey = await crypto.subtle.importKey(
    "raw",
    replyKeyBytes,
    { name: "X25519" },
    true,
    [],
  );

  const ephemeral = testOverrides?.ephemeralKeyPair ??
    ((await crypto.subtle.generateKey(
      { name: "X25519" },
      true,
      ["deriveBits"],
    )) as CryptoKeyPair);
  const ephemeralPublicBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", ephemeral.publicKey),
  );

  const sharedBits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "X25519", public: recipientPublicKey },
      ephemeral.privateKey,
      256,
    ),
  );

  const salt = new Uint8Array(64);
  salt.set(ephemeralPublicBytes, 0);
  salt.set(replyKeyBytes, 32);

  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, [
    "deriveBits",
  ]);
  const aesKeyBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: VPN_REPLY_HKDF_INFO },
    hkdfKey,
    256,
  );
  const aesKey = await crypto.subtle.importKey(
    "raw",
    aesKeyBits,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const nonce = testOverrides?.nonce ?? crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: new TextEncoder().encode(deviceId) },
      aesKey,
      new TextEncoder().encode(plaintext),
    ),
  );

  return {
    v: 1,
    alg: VPN_REPLY_ALG,
    epk: bytesToBase64(ephemeralPublicBytes),
    nonce: bytesToBase64(nonce),
    ct: bytesToBase64(ct),
  };
}

// ── device / candidate-code authentication (decision-033 §1-§3) ───────────

export type DeviceAuthPurpose = "vpn" | "ssh-enroll" | "ssh-live-enroll" | "ssh-trust";

type DenoEnvLike = { get(key: string): string | undefined };
const denoEnv: DenoEnvLike | undefined =
  (globalThis as { Deno?: { env: DenoEnvLike } }).Deno?.env;

function requiredEnv(name: string): string {
  const value = denoEnv?.get(name);
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

const DEFAULT_BACKEND_URL = "http://iotgw-ui-backend.iotgw-ui.svc.cluster.local:4444";

function backendUrlFromEnv(): string {
  return (denoEnv?.get("IOTGW_BACKEND_URL") ?? DEFAULT_BACKEND_URL).replace(/\/+$/, "");
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface DeviceAuthCandidate {
  step: number;
  code: string;
}

interface CandidatesResponse {
  seed_id: string;
  locked_until: string | null;
  candidates: DeviceAuthCandidate[];
}

/**
 * `POST {IOTGW_BACKEND_URL}/internal/device-auth/candidates`, bearer
 * `DEVICE_AUTH_TOKEN`. Returns the parsed body, or a `Response` to return
 * verbatim (a 401 substituted for the backend's 404 so a stale/probing
 * device_id never learns "device not found" from an edge function).
 */
async function fetchCandidates(deviceUuid: string): Promise<CandidatesResponse | Response> {
  const token = requiredEnv("DEVICE_AUTH_TOKEN");
  const backendUrl = backendUrlFromEnv();

  const res = await fetch(`${backendUrl}/internal/device-auth/candidates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ device_uuid: deviceUuid }),
  });

  if (res.status === 404) {
    return jsonResponse({ error: "Authentication failed" }, 401);
  }
  if (!res.ok) {
    throw new Error(
      `device-auth candidates request failed (status ${res.status}): ${await res.text()}`,
    );
  }
  return (await res.json()) as CandidatesResponse;
}

export interface SupabaseRestConfig {
  url: string;
  serviceRoleKey: string;
}

export function restHeaders(cfg: SupabaseRestConfig): Record<string, string> {
  return {
    apikey: cfg.serviceRoleKey,
    Authorization: `Bearer ${cfg.serviceRoleKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function restConfigFromEnv(): SupabaseRestConfig {
  return {
    url: requiredEnv("SUPABASE_URL"),
    serviceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const cfg = restConfigFromEnv();
  const res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: restHeaders(cfg),
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(`rpc ${fn} failed (status ${res.status}): ${await res.text()}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** `record_device_otp_failure(p_device_id)` — returns the (maybe null) resulting lockout. */
export async function recordDeviceOtpFailure(deviceId: string): Promise<string | null> {
  return await callRpc<string | null>("record_device_otp_failure", { p_device_id: deviceId });
}

/** `consume_device_otp(p_device_id, p_seed_id, p_purpose, p_step)` — single-use gate. */
export async function consumeDeviceOtp(
  deviceId: string,
  seedId: string,
  purpose: DeviceAuthPurpose,
  step: number,
): Promise<boolean> {
  return await callRpc<boolean>("consume_device_otp", {
    p_device_id: deviceId,
    p_seed_id: seedId,
    p_purpose: purpose,
    p_step: step,
  });
}

/** `consume_device_renew(p_device_id, p_ts)` — replay guard for the host-key `renew` action. */
export async function consumeDeviceRenew(deviceId: string, ts: number): Promise<boolean> {
  return await callRpc<boolean>("consume_device_renew", { p_device_id: deviceId, p_ts: ts });
}

export interface DeviceAuthSuccess {
  plaintext: string;
  code: string;
  step: number;
}

interface DecryptedDeviceRequest extends DeviceAuthSuccess {
  seedId: string;
}

/**
 * Steps 1-2 of decision-033 §1/§3: fetch the codes valid right now, enforce
 * the lockout, and try each against the envelope. Does NOT consume the code —
 * split out from `authenticateDevice` because `ssh-ca`'s code-envelope
 * actions (`trust`/`enroll`/`live-enroll`) carry their `purpose` *inside* the
 * still-encrypted plaintext, so the purpose needed for `consume_device_otp`
 * is only known after this step runs. `authenticateDevice` below is the
 * single-call convenience wrapper for the common case (`vpn`, where the
 * purpose is known upfront).
 */
export async function decryptDeviceRequest(
  body: Uint8Array,
  deviceUuid: string,
): Promise<DecryptedDeviceRequest | Response> {
  const candidatesResult = await fetchCandidates(deviceUuid);
  if (candidatesResult instanceof Response) return candidatesResult;
  const { seed_id: seedId, locked_until: lockedUntil, candidates } = candidatesResult;

  if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) {
    return jsonResponse({ error: "too many failed codes; try again later" }, 429);
  }

  for (const candidate of candidates) {
    try {
      const plaintext = await decryptPayload(body, candidate.code);
      return { plaintext, code: candidate.code, step: candidate.step, seedId };
    } catch {
      // Wrong code for this step — try the next candidate.
    }
  }

  try {
    await recordDeviceOtpFailure(deviceUuid);
  } catch (error) {
    console.error(`record_device_otp_failure failed for device ${deviceUuid}:`, error);
  }
  return jsonResponse({ error: "Authentication failed" }, 401);
}

/**
 * The full decision-033 §1-§3 flow for a caller that knows its `purpose`
 * upfront (the `vpn` function; `ssh-ca`'s per-action purposes are resolved
 * after decrypting and call `consumeDeviceOtp` directly — see
 * `decryptDeviceRequest`'s docstring).
 *
 * Returns `{plaintext, code, step}` on success, or a `Response` to return
 * verbatim (429 locked out, 401 wrong/reused code).
 */
export async function authenticateDevice(
  body: Uint8Array,
  deviceUuid: string,
  purpose: DeviceAuthPurpose,
): Promise<DeviceAuthSuccess | Response> {
  const decrypted = await decryptDeviceRequest(body, deviceUuid);
  if (decrypted instanceof Response) return decrypted;

  const consumed = await consumeDeviceOtp(deviceUuid, decrypted.seedId, purpose, decrypted.step);
  if (!consumed) {
    return jsonResponse(
      { error: "code already used — get a new code from the UI" },
      401,
    );
  }

  return { plaintext: decrypted.plaintext, code: decrypted.code, step: decrypted.step };
}

/** `|now - ts| <= windowSeconds` — extracted for unit testing without a live clock. */
export function withinTimeWindow(
  ts: number,
  windowSeconds: number,
  now: number = Math.floor(Date.now() / 1000),
): boolean {
  return Math.abs(now - ts) <= windowSeconds;
}

// ── Device lookup ──────────────────────────────────────────────────────────

/** `device_id` wire format: `<device name>@<first 8 chars of network uuid>`. */
export function parseDeviceIdentifier(deviceId: string): {
  name: string;
  networkPrefix: string;
} {
  const [namePart, networkPart] = deviceId.split("@");
  if (!namePart || !networkPart) {
    throw new Error("Invalid device_id format. Expected '<name>@<networkPrefix>'");
  }
  const name = namePart.trim();
  const networkPrefix = networkPart.trim().slice(0, 8);
  if (!name || !networkPrefix) {
    throw new Error("device_id is missing required components");
  }
  return { name, networkPrefix };
}

/**
 * Resolve `<name>@<networkPrefix>` to a device row, following the embed to the
 * network and the domain. `select` is caller-supplied so each function asks
 * only for the columns it needs.
 */
export async function fetchDeviceRow<T extends { id: string; network_id: string }>(
  cfg: SupabaseRestConfig,
  deviceId: string,
  select: string,
): Promise<T> {
  const { name, networkPrefix } = parseDeviceIdentifier(deviceId);

  const url = new URL(`${cfg.url}/rest/v1/devices`);
  url.searchParams.set("select", select);
  url.searchParams.set("name", `eq.${name}`);
  url.searchParams.set("order", "updated_at.desc");
  url.searchParams.set("limit", "25");

  const response = await fetch(url.toString(), { headers: restHeaders(cfg) });
  if (!response.ok) {
    throw new Error(
      `Failed to look up device (status ${response.status}): ${await response.text()}`,
    );
  }

  const rows = (await response.json()) as T[];
  // The wire format only carries a network *prefix*, so disambiguate here.
  const device = rows?.find(
    (row) =>
      row.network_id &&
      row.network_id.slice(0, networkPrefix.length).toLowerCase() ===
        networkPrefix.toLowerCase(),
  );
  if (!device) throw new Error("Device not found for provided device_id");
  return device;
}
