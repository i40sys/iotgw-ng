// Device authentication primitives shared by the `vpn` and `ssh-ca` edge
// functions (decision-009, decision-024, decision-026).
//
// A PXE-booting / freshly provisioned gateway has no credential of its own yet.
// It authenticates by proving it can encrypt a request with the TOTP derived
// from `<domain_id>-<network_id>-<device_id>-<totp_counter>` — values only the
// device's own provisioning payload and the database know. The same code
// encrypts the response, so the exchange is confidential even to an observer
// who holds the anon key.
//
// This file exists because `ssh-ca` must use *exactly* the same primitive as
// `vpn`: a silent divergence between two copies would either break enrollment
// or, worse, accept a code the other would reject. See decision-025 §B.
//
// The envelope is deliberately OpenSSL-compatible
// (`openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt`) so a gateway needs
// nothing but busybox + openssl to speak it.

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

// ── TOTP (RFC 4226 HOTP over a 600 s time step) ────────────────────────────

export const TOTP_PERIOD_SECONDS = 600;
export const TOTP_DIGITS = 6;
/** ±1 step, to absorb clock drift between the gateway and the cluster. */
export const TOTP_WINDOW = 1;

async function generateHOTP(
  secret: Uint8Array,
  counter: number,
  digits: number,
): Promise<string> {
  const counterBuffer = new ArrayBuffer(8);
  new DataView(counterBuffer).setBigUint64(0, BigInt(counter), false);

  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBuffer));

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

/**
 * The codes a device may legitimately present right now.
 *
 * The secret is the literal string `<domain>-<network>-<device>-<counter>`;
 * bumping `devices.totp_counter` invalidates every previously valid code.
 */
export async function validTotpCodes(ids: {
  domainId: string;
  networkId: string;
  deviceId: string;
  totpCounter: number;
}): Promise<string[]> {
  const secret = new TextEncoder().encode(
    `${ids.domainId}-${ids.networkId}-${ids.deviceId}-${ids.totpCounter}`,
  );
  const current = Math.floor(Math.floor(Date.now() / 1000) / TOTP_PERIOD_SECONDS);

  const codes: string[] = [];
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset++) {
    codes.push(await generateHOTP(secret, current + offset, TOTP_DIGITS));
  }
  return codes;
}

/**
 * Decrypt a request body by trying every currently valid code. Success *is*
 * the authentication — we never compare a code the client sent us, so there is
 * nothing to leak by timing and nothing to replay beyond the 600 s window.
 *
 * Returns the plaintext and the code that worked (needed to encrypt the reply).
 */
export async function authenticateAndDecrypt(
  body: Uint8Array,
  codes: string[],
): Promise<{ plaintext: string; code: string } | null> {
  for (const code of codes) {
    try {
      return { plaintext: await decryptPayload(body, code), code };
    } catch {
      // Wrong code for this window — try the next.
    }
  }
  return null;
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
