import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@iotgw/supabase-contract";
import { logger } from "../logger";
import {
  KmsError,
  findNode,
  i as ttlvInt,
  e as ttlvEnum,
  isAlreadyExists,
  kmip,
  revokeAndDestroy,
  s as ttlvText,
  struct,
} from "./kms";

/**
 * Device one-time codes from a KMS-held random seed (decision-033, task-132).
 *
 * Each device has a 256-bit random seed stored ONLY in Cosmian KMS as a
 * symmetric key `device_totp_<device uuid>_<n>` (n = rotation number). The
 * backend is the only component that reads it (KMIP Get, Raw) and it computes
 * RFC 6238 codes in memory — the seed is never persisted, logged or returned.
 * `devices.totp_seed_id` holds the live UID (null = not created yet → lazily).
 */

export const CODE_PERIOD_SECONDS = 600;
export const CODE_DIGITS = 6;
/** Steps accepted around "now" by the verifying edge functions (±WINDOW). */
export const CODE_WINDOW = 1;

export type OtpPurpose = "vpn" | "ssh-enroll" | "ssh-live-enroll" | "ssh-trust";

type Db = SupabaseClient<Database>;

export class DeviceNotFoundError extends Error {
  constructor(message = "device not found") {
    super(message);
    this.name = "DeviceNotFoundError";
  }
}

export class NoEnrollCodeError extends Error {
  constructor() {
    super("no unused enrollment code in the current window");
    this.name = "NoEnrollCodeError";
  }
}

// ── RFC 4226 / RFC 6238 ────────────────────────────────────────────────────

/** RFC 4226 HOTP: HMAC-SHA1 over the 8-byte big-endian counter, truncated. */
export function hotp(
  key: Buffer,
  counter: number | bigint,
  digits: number = CODE_DIGITS,
): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac("sha1", key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

/** RFC 6238 time step for a unix time in seconds. */
export function stepAt(
  unixSeconds: number,
  period: number = CODE_PERIOD_SECONDS,
): number {
  return Math.floor(unixSeconds / period);
}

/** RFC 6238 TOTP (defaults: 600 s step, 6 digits). */
export function totp(
  key: Buffer,
  unixSeconds: number,
  period: number = CODE_PERIOD_SECONDS,
  digits: number = CODE_DIGITS,
): string {
  return hotp(key, stepAt(unixSeconds, period), digits);
}

/** The device code for an explicit step (6 digits). */
export function codeForStep(key: Buffer, step: number): string {
  return hotp(key, step, CODE_DIGITS);
}

/** End of the acceptance window of `step`: accepted while now ≤ step + WINDOW. */
export function stepValidUntil(step: number): string {
  return new Date(
    (step + CODE_WINDOW + 1) * CODE_PERIOD_SECONDS * 1000,
  ).toISOString();
}

// ── KMS seed ───────────────────────────────────────────────────────────────

export function deviceTotpSeedId(deviceUuid: string, rotation: number): string {
  return `device_totp_${deviceUuid}_${rotation}`;
}

/** Rotation number of a seed UID (`device_totp_<uuid>_<n>` → n), 0 if unparsable. */
export function seedRotation(seedId: string | null | undefined): number {
  const m = /_(\d+)$/.exec(seedId ?? "");
  return m ? Number(m[1]) : 0;
}

// KMIP usage mask MAC_Generate (0x80) | MAC_Verify (0x100): the seed is an HMAC key.
const HMAC_USAGE_MASK = 0x80 | 0x100;

/**
 * Create the seed as a 256-bit symmetric key with a deterministic UID. An
 * already-existing UID is reused (a crash between Create and the DB update must
 * not wedge the device).
 */
export async function createSeed(
  deviceUuid: string,
  rotation: number,
): Promise<string> {
  const uid = deviceTotpSeedId(deviceUuid, rotation);
  const tags = ["device-totp", `device-${deviceUuid}`];
  try {
    await kmip(
      struct("Create", [
        ttlvEnum("ObjectType", "SymmetricKey"),
        struct("Attributes", [
          ttlvEnum("CryptographicAlgorithm", "AES"),
          ttlvInt("CryptographicLength", 256),
          ttlvInt("CryptographicUsageMask", HMAC_USAGE_MASK),
          ttlvEnum("KeyFormatType", "TransparentSymmetricKey"),
          ttlvEnum("ObjectType", "SymmetricKey"),
          ttlvText("UniqueIdentifier", uid),
          struct("Attribute", [
            ttlvText("VendorIdentification", "cosmian"),
            ttlvText("AttributeName", "tag"),
            ttlvText("AttributeValue", JSON.stringify(tags)),
          ]),
        ]),
      ]),
    );
    logger.info({ seedId: uid }, "Created device code seed in KMS");
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
    logger.info({ seedId: uid }, "Device code seed already exists in KMS");
  }
  return uid;
}

/** Read the raw 32-byte seed. Never log or return the result. */
export async function getSeed(seedId: string): Promise<Buffer> {
  const resp = await kmip(
    struct("Get", [
      ttlvText("UniqueIdentifier", seedId),
      ttlvEnum("KeyFormatType", "Raw"),
    ]),
  );
  const hex = findNode(resp, "KeyMaterial")?.value;
  if (typeof hex !== "string") {
    throw new KmsError(`KMS Get returned no KeyMaterial for ${seedId}`);
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new KmsError(
      `KMS seed ${seedId} has ${key.length} bytes, expected 32`,
    );
  }
  return key;
}

export async function destroySeed(seedId: string): Promise<void> {
  await revokeAndDestroy(seedId);
}

// ── Device-level operations (DB + KMS) ─────────────────────────────────────

interface DeviceSeedRow {
  id: string;
  totp_seed_id: string | null;
  totp_locked_until: string | null;
}

async function loadDevice(supabase: Db, deviceUuid: string): Promise<DeviceSeedRow> {
  const { data, error } = await supabase
    .from("devices")
    .select("id, totp_seed_id, totp_locked_until")
    .eq("id", deviceUuid)
    .maybeSingle();
  if (error) {
    // An invalid uuid is a "no such device", not a server fault.
    if (error.code === "22P02") throw new DeviceNotFoundError();
    throw new Error(`Failed to read device: ${error.message}`);
  }
  if (!data) throw new DeviceNotFoundError();
  return data as DeviceSeedRow;
}

/**
 * Make sure the device has a seed, creating rotation 1 lazily. The DB write is
 * conditional (only while totp_seed_id is still null) so two concurrent callers
 * converge on one UID.
 */
export async function ensureDeviceSeed(
  supabase: Db,
  deviceUuid: string,
): Promise<string> {
  const device = await loadDevice(supabase, deviceUuid);
  if (device.totp_seed_id) return device.totp_seed_id;

  const seedId = await createSeed(device.id, 1);
  const { data, error } = await supabase
    .from("devices")
    .update({
      totp_seed_id: seedId,
      totp_seed_rotated_at: new Date().toISOString(),
    })
    .eq("id", device.id)
    .is("totp_seed_id", null)
    .select("totp_seed_id");
  if (error) {
    throw new Error(`Failed to persist the device code seed id: ${error.message}`);
  }
  if (data && data.length > 0) return seedId;
  // Lost a race: someone else stored a seed id first.
  const again = await loadDevice(supabase, deviceUuid);
  if (!again.totp_seed_id) {
    throw new Error("Device code seed id vanished while being created");
  }
  return again.totp_seed_id;
}

/**
 * "Reset code": create seed n+1, point the device at it, then revoke+destroy
 * the old one (best-effort — the old seed is already unreachable by then).
 */
export async function rotateDeviceSeed(
  supabase: Db,
  deviceUuid: string,
): Promise<string> {
  const device = await loadDevice(supabase, deviceUuid);
  const oldSeedId = device.totp_seed_id;
  const newSeedId = await createSeed(device.id, seedRotation(oldSeedId) + 1);

  let query = supabase
    .from("devices")
    .update({
      totp_seed_id: newSeedId,
      totp_seed_rotated_at: new Date().toISOString(),
    })
    .eq("id", device.id);
  query = oldSeedId
    ? query.eq("totp_seed_id", oldSeedId)
    : query.is("totp_seed_id", null);
  const { data, error } = await query.select("totp_seed_id");
  if (error) {
    throw new Error(`Failed to persist the rotated code seed id: ${error.message}`);
  }
  if (!data || data.length === 0) {
    // A concurrent rotation won; drop ours and use the stored one.
    await destroySeed(newSeedId).catch((err: unknown) =>
      logger.warn({ err, seedId: newSeedId }, "Failed to destroy an unused seed"),
    );
    const again = await loadDevice(supabase, deviceUuid);
    if (!again.totp_seed_id) throw new Error("Device code seed id vanished");
    return again.totp_seed_id;
  }

  if (oldSeedId) {
    try {
      await destroySeed(oldSeedId);
    } catch (err) {
      logger.warn(
        { err, seedId: oldSeedId },
        "Rotated the device code seed but failed to destroy the old one",
      );
    }
  }
  logger.info({ deviceId: device.id, seedId: newSeedId }, "Rotated device code seed");
  return newSeedId;
}

/** Highest consumed step ≥ `fromStep` for (device, seed, purpose), or null. */
async function latestUsedStep(
  supabase: Db,
  deviceUuid: string,
  seedId: string,
  purpose: OtpPurpose,
  fromStep: number,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("device_otp_uses")
    .select("step")
    .eq("device_id", deviceUuid)
    .eq("seed_id", seedId)
    .eq("purpose", purpose)
    .gte("step", fromStep)
    .order("step", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Failed to read code uses: ${error.message}`);
  const row = data?.[0];
  return row ? Number(row.step) : null;
}

export interface DeviceCode {
  code: string;
  step: number;
  /** ISO end of the acceptance window of `step` ((step + 2) × 600 s). */
  validUntil: string;
  /** true when the current step's code was already used and this is step + 1. */
  next: boolean;
}

/**
 * The code the operator should type now: the current step's code, unless that
 * step was already consumed for `vpn` — then the next step's code (still inside
 * the +1 window) so a lost reply does not force a reset.
 */
export async function getDeviceCode(
  supabase: Db,
  deviceUuid: string,
  nowMs: number = Date.now(),
): Promise<DeviceCode> {
  const seedId = await ensureDeviceSeed(supabase, deviceUuid);
  const current = stepAt(Math.floor(nowMs / 1000));
  const used = await latestUsedStep(supabase, deviceUuid, seedId, "vpn", current);
  const next = used !== null;
  const step = next ? current + 1 : current;
  const key = await getSeed(seedId);
  return {
    code: codeForStep(key, step),
    step,
    validUntil: stepValidUntil(step),
    next,
  };
}

export interface CodeCandidates {
  seed_id: string;
  locked_until: string | null;
  candidates: { step: number; code: string }[];
}

/** Codes valid right now (steps now-1..now+1) for the verifying edge functions. */
export async function getCodeCandidates(
  supabase: Db,
  deviceUuid: string,
  nowMs: number = Date.now(),
): Promise<CodeCandidates> {
  const device = await loadDevice(supabase, deviceUuid);
  const seedId = device.totp_seed_id ?? (await ensureDeviceSeed(supabase, device.id));
  const key = await getSeed(seedId);
  const current = stepAt(Math.floor(nowMs / 1000));
  const candidates = [];
  for (let step = current - CODE_WINDOW; step <= current + CODE_WINDOW; step++) {
    candidates.push({ step, code: codeForStep(key, step) });
  }
  const lockedMs = device.totp_locked_until
    ? Date.parse(device.totp_locked_until)
    : NaN;
  return {
    seed_id: seedId,
    locked_until:
      Number.isFinite(lockedMs) && lockedMs > nowMs
        ? new Date(lockedMs).toISOString()
        : null,
    candidates,
  };
}

/**
 * Resolve a device by uuid, or by the wire identifier `<name>@<net8>` (same
 * semantics as the edge functions' fetchDeviceRow: match the name, then the
 * first row whose network id starts with the prefix, newest first).
 */
export async function resolveDeviceUuid(
  supabase: Db,
  ref: { device_uuid?: string; device_id?: string },
): Promise<string> {
  if (ref.device_uuid) return (await loadDevice(supabase, ref.device_uuid)).id;
  const [namePart, networkPart] = (ref.device_id ?? "").split("@");
  const name = namePart?.trim() ?? "";
  const prefix = (networkPart ?? "").trim().slice(0, 8).toLowerCase();
  if (!name || !prefix) throw new DeviceNotFoundError();
  const { data, error } = await supabase
    .from("devices")
    .select("id, network_id")
    .eq("name", name)
    .order("updated_at", { ascending: false })
    .limit(25);
  if (error) throw new Error(`Failed to look up device: ${error.message}`);
  const row = (data ?? []).find(
    (r) =>
      r.network_id &&
      r.network_id.slice(0, prefix.length).toLowerCase() === prefix,
  );
  if (!row) throw new DeviceNotFoundError();
  return row.id;
}

export interface EnrollCode {
  code: string;
  step: number;
  valid_until: string;
  device_uuid: string;
}

/**
 * One code for Kestra's first SSH enrollment: the first step ≥ now (within the
 * +WINDOW) that `consume_device_otp(…, 'ssh-enroll', step)` would still accept.
 */
export async function getEnrollCode(
  supabase: Db,
  deviceUuid: string,
  nowMs: number = Date.now(),
): Promise<EnrollCode> {
  const seedId = await ensureDeviceSeed(supabase, deviceUuid);
  const current = stepAt(Math.floor(nowMs / 1000));
  const used = await latestUsedStep(supabase, deviceUuid, seedId, "ssh-enroll", current);
  const step = used === null ? current : used + 1;
  if (step > current + CODE_WINDOW) throw new NoEnrollCodeError();
  const key = await getSeed(seedId);
  return {
    code: codeForStep(key, step),
    step,
    valid_until: stepValidUntil(step),
    device_uuid: deviceUuid,
  };
}
