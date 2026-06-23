import crypto from "node:crypto";
import { logger } from "../logger";

/**
 * Cosmian KMS client for device SSH keys (decision-010).
 *
 * The backend talks to the KMS over its KMIP 2.1 JSON-TTLV REST API
 * (`POST <KMS_URL>/kmip/2_1`) and derives the OpenSSH public key locally with
 * `node:crypto` — no `cosmian` CLI binary and no Python toolchain are needed in
 * the backend runtime. The device row stores ONLY the KMS object id
 * (`device_ssh_<deviceId>`), never key material.
 *
 * KMS connection is env-driven (decision-014): `KMS_URL` (+ optional
 * `KMS_AUTH_TOKEN` for when the KMS gains auth). The default is a dev
 * convenience only — the canonical source is the rendered secret.
 */

// Default is the in-cluster KMS Service FQDN (decision-020: cosmian-kms moved to
// the `kms` namespace). The canonical source is the env (KMS_URL) set on the
// backend Deployment; this default only applies if the env is unset.
const KMS_URL = (
  process.env.KMS_URL ?? "http://cosmian-kms.kms.svc.cluster.local:9998"
).replace(/\/+$/, "");
const KMS_AUTH_TOKEN = process.env.KMS_AUTH_TOKEN;

export class KmsError extends Error {
  readonly detail?: unknown;
  constructor(message: string, detail?: unknown) {
    super(message);
    this.name = "KmsError";
    this.detail = detail;
  }
}

/** Canonical KMS object id for a device SSH key (decision-010, devices table). */
export function deviceSshKeyId(deviceId: string): string {
  return `device_ssh_${deviceId}`;
}

// ── KMIP TTLV-JSON helpers ────────────────────────────────────────────────

type TtlvType =
  | "Structure"
  | "TextString"
  | "Enumeration"
  | "Integer"
  | "Boolean"
  | "ByteString"
  | "DateTime";

interface TtlvNode {
  tag: string;
  type: TtlvType;
  value: string | number | boolean | TtlvNode[];
}

const s = (tag: string, value: string): TtlvNode => ({
  tag,
  type: "TextString",
  value,
});
const e = (tag: string, value: string): TtlvNode => ({
  tag,
  type: "Enumeration",
  value,
});
const i = (tag: string, value: number): TtlvNode => ({
  tag,
  type: "Integer",
  value,
});
const b = (tag: string, value: boolean): TtlvNode => ({
  tag,
  type: "Boolean",
  value,
});
const struct = (tag: string, value: TtlvNode[]): TtlvNode => ({
  tag,
  type: "Structure",
  value,
});

/** Depth-first search for the first node with the given tag. */
function findNode(node: unknown, tag: string): TtlvNode | undefined {
  if (!node || typeof node !== "object") return undefined;
  const n = node as TtlvNode;
  if (n.tag === tag) return n;
  if (Array.isArray(n.value)) {
    for (const child of n.value) {
      const hit = findNode(child, tag);
      if (hit) return hit;
    }
  }
  return undefined;
}

async function kmip(body: TtlvNode): Promise<TtlvNode> {
  let res: Response;
  try {
    res = await fetch(`${KMS_URL}/kmip/2_1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(KMS_AUTH_TOKEN
          ? { Authorization: `Bearer ${KMS_AUTH_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new KmsError(`KMS unreachable at ${KMS_URL}`, cause);
  }

  const text = await res.text();
  let json: TtlvNode;
  try {
    json = JSON.parse(text) as TtlvNode;
  } catch {
    throw new KmsError(
      `KMS returned non-JSON (HTTP ${res.status}): ${text.slice(0, 500)}`,
    );
  }

  // KMIP errors surface either as a non-2xx HTTP status or an *Error tag /
  // a non-Success ResultStatus in the body.
  const resultStatus = findNode(json, "ResultStatus")?.value;
  const isError =
    !res.ok ||
    (typeof json.tag === "string" && json.tag.endsWith("Error")) ||
    (typeof resultStatus === "string" && resultStatus !== "Success");
  if (isError) {
    throw new KmsError(`KMS operation failed (HTTP ${res.status})`, json);
  }
  return json;
}

// The KMS reports failures either as a JSON *Error body or as a plain-text
// HTTP 4xx (e.g. "Item_Not_Found: <id>"). Match against both the message and
// any structured detail.
function haystack(err: unknown): string {
  if (!(err instanceof KmsError)) return "";
  return `${err.message} ${JSON.stringify(err.detail ?? "")}`.toLowerCase();
}
function isNotFound(err: unknown): boolean {
  return /(item_?not_?found|object_?not_?found|no object|does not exist|non-?existent|not\s+found)/.test(
    haystack(err),
  );
}
function isAlreadyExists(err: unknown): boolean {
  // Match "(objects) already exist" but NOT not-found phrasings like
  // "does not exist" / "non-existent" (those are handled by isNotFound).
  return /already\s*exist|objects?\s+(?:already\s+)?exist/.test(haystack(err)) && !isNotFound(err);
}

// ── Operations ─────────────────────────────────────────────────────────────

interface KeyPairIds {
  privateKeyId: string;
  publicKeyId: string;
}

/** Low-level CreateKeyPair (ed25519) with a deterministic private-key id. */
async function createKeyPair(
  keyId: string,
  tags: string[],
): Promise<KeyPairIds> {
  const body = struct("CreateKeyPair", [
    struct("CommonAttributes", [
      e("CryptographicAlgorithm", "Ed25519"),
      struct("CryptographicDomainParameters", [
        i("Qlength", 256),
        e("RecommendedCurve", "CURVEED25519"),
      ]),
      i("CryptographicUsageMask", 2097152),
      e("ObjectType", "PrivateKey"),
      struct("Attribute", [
        s("VendorIdentification", "cosmian"),
        s("AttributeName", "tag"),
        s("AttributeValue", JSON.stringify(tags)),
      ]),
    ]),
    struct("PrivateKeyAttributes", [
      e("CryptographicAlgorithm", "Ed25519"),
      e("KeyFormatType", "ECPrivateKey"),
      e("ObjectType", "PrivateKey"),
      s("UniqueIdentifier", keyId),
    ]),
    struct("PublicKeyAttributes", [
      e("CryptographicAlgorithm", "Ed25519"),
      e("KeyFormatType", "TransparentECPublicKey"),
      e("ObjectType", "PublicKey"),
    ]),
  ]);

  const resp = await kmip(body);
  const privateKeyId =
    (findNode(resp, "PrivateKeyUniqueIdentifier")?.value as string) ?? keyId;
  const publicKeyId =
    (findNode(resp, "PublicKeyUniqueIdentifier")?.value as string) ??
    `${keyId}_pk`;
  return { privateKeyId, publicKeyId };
}

/**
 * Revoke (an active key must be revoked before destruction — a raw Destroy
 * returns Wrong_Key_Lifecycle_State) then Destroy with `Remove`+`Cascade`
 * (mirrors the CLI's `destroy --remove`, deleting from the store rather than
 * leaving a tombstone that would block re-creating the same id). Tolerates a
 * missing object.
 */
async function revokeAndDestroy(id: string): Promise<void> {
  try {
    await kmip(
      struct("Revoke", [
        s("UniqueIdentifier", id),
        struct("RevocationReason", [
          e("RevocationReasonCode", "Unspecified"),
        ]),
      ]),
    );
  } catch (err) {
    if (!isNotFound(err)) {
      logger.warn({ keyId: id, err }, "KMS revoke before destroy failed (ignored)");
    }
  }
  try {
    await kmip(
      struct("Destroy", [
        s("UniqueIdentifier", id),
        b("Remove", true),
        b("Cascade", true),
      ]),
    );
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}

/**
 * Fully remove a device key pair from the KMS. Destroys BOTH the private-key id
 * and the public-key id (`<id>_pk`): normally `Cascade` removes the pair via the
 * private key, but if the private key is already gone an orphaned `<id>_pk`
 * would otherwise survive and block re-creating the same id. Safe to call before
 * a force-regenerate even when nothing exists.
 */
export async function destroyDeviceSshKey(keyId: string): Promise<void> {
  await revokeAndDestroy(keyId);
  await revokeAndDestroy(`${keyId}_pk`);
}

/**
 * Fetch a key's OpenSSH-format public key, derived locally from the private
 * key's PKCS8 (verified byte-identical to `ssh-keygen` / the kms_tools recipe).
 */
export async function getDeviceSshPublicKey(keyId: string): Promise<string> {
  const resp = await kmip(
    struct("Get", [
      s("UniqueIdentifier", keyId),
      e("KeyFormatType", "PKCS8"),
    ]),
  );
  const hex = findNode(resp, "KeyMaterial")?.value;
  if (typeof hex !== "string") {
    throw new KmsError("KMS Get returned no KeyMaterial", resp);
  }
  const der = Buffer.from(hex, "hex");
  const priv = crypto.createPrivateKey({
    key: der,
    format: "der",
    type: "pkcs8",
  });
  const spki = crypto
    .createPublicKey(priv)
    .export({ format: "der", type: "spki" });
  // ed25519 SPKI = 12-byte header + 32-byte raw public key.
  const rawPub = spki.subarray(spki.length - 32);
  const sshField = (b: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(b.length, 0);
    return Buffer.concat([len, b]);
  };
  const wire = Buffer.concat([
    sshField(Buffer.from("ssh-ed25519")),
    sshField(rawPub),
  ]);
  return `ssh-ed25519 ${wire.toString("base64")} ${keyId}`;
}

export interface EnsureDeviceSshKeyParams {
  deviceId: string;
  networkId?: string;
  domainId?: string;
  /** Revoke+destroy any existing key and mint a fresh one. */
  force?: boolean;
}

export interface EnsuredSshKey {
  sshKeyId: string;
  /** true if a new key was minted, false if an existing one was reused. */
  created: boolean;
}

/**
 * Idempotently ensure a device has an ed25519 SSH key in the KMS, returning its
 * object id. Without `force`, an existing key is reused (no-op). With `force`,
 * the existing key is revoked+destroyed and a new one is minted.
 */
export async function ensureDeviceSshKey(
  params: EnsureDeviceSshKeyParams,
): Promise<EnsuredSshKey> {
  const keyId = deviceSshKeyId(params.deviceId);
  const tags = [
    "ssh-key",
    "ssh-key-ed25519",
    `device-${params.deviceId}`,
    ...(params.networkId ? [`network-${params.networkId}`] : []),
    ...(params.domainId ? [`domain-${params.domainId}`] : []),
  ];

  if (params.force) {
    await destroyDeviceSshKey(keyId);
  }

  try {
    await createKeyPair(keyId, tags);
    logger.info({ keyId }, "Created device SSH key in KMS");
    return { sshKeyId: keyId, created: true };
  } catch (err) {
    // Without force, an existing key is a successful no-op (idempotent).
    if (!params.force && isAlreadyExists(err)) {
      logger.info({ keyId }, "Device SSH key already exists in KMS");
      return { sshKeyId: keyId, created: false };
    }
    throw err;
  }
}

/** Liveness probe for the KMS. */
export async function kmsHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${KMS_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
