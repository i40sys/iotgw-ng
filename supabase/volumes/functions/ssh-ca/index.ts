// ssh-ca — the only bridge between an IoT gateway and pki-manager.
//
// decision-024 (target architecture), decision-026 (provisioning sequence),
// decision-033 (one-time codes from a KMS-held seed; host-key renewal).
//
// A gateway generates its own SSH host key, proves it is that device with a
// one-time code from the backend-held per-device seed (decision-033 — a
// gateway can no longer derive this itself), and gets back a host
// certificate signed by its *domain's* Host CA plus the public trust
// material it needs. The gateway never talks to pki-manager, never sees the
// fleet token, and never sends a private key anywhere.
//
// FOUR actions, dispatched on the request's Content-Type:
//
//   Content-Type: application/octet-stream (the code envelope) — device_id is
//   a query parameter, the body is `openssl enc -aes-256-cbc ...` of a JSON
//   object naming one of:
//     trust        — public trust material only (User CA, Host CA, principals).
//                    Safe to call before a host key exists.
//     enroll       — the above plus: sign `host_pubkey` with the domain's Host
//                    CA, return the certificate + sshd drop-in, and record the
//                    enrollment. FIRST enrollment only — refused (409) once
//                    the device already has one; renew the existing key with
//                    "renew" or use Reset SSH enrollment (in the UI) after a
//                    reinstall.
//     live-enroll  — the trust bundle plus a SHORT-LIVED host certificate for
//                    the live (PXE) provisioning image's per-boot host key,
//                    under a separate `live-…` FQDN. Never touches the
//                    device's permanent enrollment (decision-031).
//
//   Content-Type: application/json — plain, UNENCRYPTED, no one-time code:
//     renew        — host-key-signed proof of possession (SSHSIG, namespace
//                    `iotgw-renew`) replaces the code entirely. Only a
//                    device that already holds the currently-enrolled host
//                    private key can renew/rotate it (decision-033 §5).

import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import {
  consumeDeviceOtp,
  consumeDeviceRenew,
  decryptDeviceRequest,
  encryptPayload,
  fetchDeviceRow,
  restHeaders,
  withinTimeWindow,
  type DeviceAuthPurpose,
  type SupabaseRestConfig,
} from "../_shared/device-auth.ts";
import {
  hostSshdConfig,
  PkiError,
  pkiConfigFromEnv,
  signHost,
  zoneTrustAnchors,
  type PkiConfig,
} from "../_shared/pki-manager.ts";
import { verifySshSig } from "../_shared/sshsig.ts";

type DenoEnv = { env: { get(key: string): string | undefined } };
const denoEnv = (globalThis as { Deno?: DenoEnv }).Deno?.env;

const SUPABASE_URL = denoEnv?.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = denoEnv?.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}
const REST: SupabaseRestConfig = {
  url: SUPABASE_URL,
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
};

/**
 * Host certificate lifetime — 90 days, renewed by the gateway at ~60
 * (decision-028 §1). Deliberately shorter than pki-manager's 52-week default:
 * a gateway that leaves the fleet without being offboarded stops being able to
 * prove its identity within a quarter, without depending on a KRL reaching it.
 */
const HOST_CERT_VALID_SECONDS = 90 * 24 * 60 * 60;

/**
 * Live-image host certificate lifetime (decision-031). The live image generates
 * a fresh host key on every boot and exists only for one provisioning session,
 * so its certificate outlives that session by a margin and nothing more.
 */
const LIVE_HOST_CERT_VALID_SECONDS = 12 * 60 * 60;

/** `|now - ts| <= this` for the "renew" action's freshness check (decision-033 §5). */
const RENEW_TS_WINDOW_SECONDS = 300;

/** The two principals every zone gets (decision-024 §5). */
const PRINCIPALS = ["iotgw-admin", "iotgw-ops"];

/** Private, deliberately non-resolvable namespace; clients pin it with HostKeyAlias. */
const FQDN_SUFFIX = "iotgw";

interface DomainRow {
  id: string;
  name: string;
  pki_zone: string | null;
  pki_user_ca_id: string | null;
  pki_host_ca_id: string | null;
}

interface NetworkRow {
  id: string;
  name: string;
  domain_id: string;
  domain: DomainRow | null;
}

interface DeviceRow {
  id: string;
  network_id: string;
  name: string;
  ip_address: string | null;
  // Enrollment continuity: the currently-enrolled host key. Empty on a
  // never-enrolled device (first enroll is one-shot); set means "enroll" is
  // refused (409) — use "renew" (proves possession) or Reset SSH enrollment.
  ssh_host_key_fingerprint: string | null;
  ssh_host_pubkey: string | null;
  network: NetworkRow | null;
}

const DEVICE_SELECT =
  "id,network_id,name,ip_address,ssh_host_key_fingerprint,ssh_host_pubkey," +
  "network:networks(id,name,domain_id,domain:domains(id,name,pki_zone,pki_user_ca_id,pki_host_ca_id))";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** DNS-safe label: lowercase, [a-z0-9-], no leading/trailing dash. */
function label(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error(`Cannot derive a DNS label from '${value}'`);
  return slug;
}

/**
 * An OpenSSH public key line, reduced to `<type> <base64>` — any comment the
 * gateway appended is dropped, and anything that is not a public key of an
 * accepted type is rejected before it reaches pki-manager.
 *
 * ECDSA-P256 is required rather than merely allowed: pki-manager's encrypted
 * per-host KRL channel is P-256 only, so an ed25519-only host cannot receive
 * revocations (decision-024 §4, decision-028 §6). ed25519 is accepted too, but
 * the caller is told what it gives up.
 */
function normalizeHostPubkey(raw: unknown): { key: string; ecies: boolean } {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("host_pubkey is required for actions 'enroll', 'live-enroll' and 'renew'");
  }
  const [type, b64] = raw.trim().split(/\s+/);
  const accepted = ["ecdsa-sha2-nistp256", "ssh-ed25519"];
  if (!accepted.includes(type) || !/^[A-Za-z0-9+/=]+$/.test(b64 ?? "")) {
    throw new Error(
      `host_pubkey must be an OpenSSH public key of type ${accepted.join(" or ")}`,
    );
  }
  return { key: `${type} ${b64}`, ecies: type === "ecdsa-sha2-nistp256" };
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The OpenSSH fingerprint of a public key — `SHA256:` + unpadded base64 of the
 * SHA-256 of the *decoded key blob*, which is what `ssh-keygen -lf` prints and
 * what sshd logs on a rejection. Hashing the textual line instead would produce
 * a number that looks like a fingerprint but matches nothing.
 */
async function opensshFingerprint(normalizedKey: string): Promise<string> {
  const b64 = normalizedKey.split(/\s+/)[1];
  const blob = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", blob));
  const b64Digest = btoa(String.fromCharCode(...digest)).replace(/=+$/, "");
  return `SHA256:${b64Digest}`;
}

/** Record the enrollment on the device row. References only — no key material. */
async function recordEnrollment(
  deviceId: string,
  patch: Record<string, string | null>,
): Promise<void> {
  const url = new URL(`${REST.url}/rest/v1/devices`);
  url.searchParams.set("id", `eq.${deviceId}`);
  const response = await fetch(url.toString(), {
    method: "PATCH",
    headers: { ...restHeaders(REST), Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    // The certificate is already signed and on its way to the gateway; failing
    // the request now would make the gateway retry an enrollment that actually
    // succeeded. Log loudly and let the reconciler pick it up instead.
    console.error(
      `Failed to record enrollment for device ${deviceId} (status ${response.status}): ${await response.text()}`,
    );
  }
}

/** The trust-bundle fields common to every action's reply. */
async function buildTrustBundle(
  pki: PkiConfig,
  domain: DomainRow,
): Promise<Record<string, unknown>> {
  const zone = domain.pki_zone!;
  // Zone-scoped anchors return the ACTIVE + any ROTATING CA of each type, so a
  // gateway seeded here keeps trusting either half of a rotating CA pair for
  // the whole overlap window (decision-028 §4) — the id-addressed ca.pub route
  // returned only one CA and would have stranded a late-renewing gateway.
  const { userCaKeys, hostCaKeys } = await zoneTrustAnchors(pki, zone);
  return {
    zone,
    domain: domain.name,
    principals: PRINCIPALS,
    auth_principals: PRINCIPALS.join("\n") + "\n",
    user_ca: userCaKeys.join("\n") + "\n",
    host_ca: hostCaKeys.join("\n") + "\n",
    // The operator-side trust lines — one @cert-authority per Host CA, so the
    // same bundle can seed a known_hosts across a Host CA rotation too.
    cert_authority:
      hostCaKeys.map((k) => `@cert-authority *.${label(domain.name)}.${FQDN_SUFFIX} ${k}`).join(
        "\n",
      ) + "\n",
  };
}

/**
 * Sign `hostPubkey` with the domain's Host CA under the device's PERMANENT
 * fqdn/addresses, render the sshd drop-in, and return the host-specific reply
 * fields. Shared by "enroll" (first signing) and "renew" (rotation) — same
 * fqdn/addresses/idempotency so a retry, an enroll-then-renew, or a renew
 * that resends the same key all land on the SAME pki-manager host record.
 */
async function signPermanentHost(
  pki: PkiConfig,
  domain: DomainRow,
  device: DeviceRow,
  hostPubkey: string,
  ecies: boolean,
): Promise<Record<string, unknown>> {
  const deviceLabel = label(device.name);
  const networkLabel = label(device.network!.name);
  const domainLabel = label(domain.name);

  // The REGISTERED fqdn carries a slice of the device uuid because
  // pki-manager's offboard is terminal and (zone, fqdn) stays unique
  // forever — a recreated device with the same name would otherwise be
  // permanently un-enrollable (decision-028 §10). The human-facing names
  // are principals instead, which is what clients actually dial.
  const fqdn = `${deviceLabel}-${device.id.slice(0, 8)}.${networkLabel}.${domainLabel}.${FQDN_SUFFIX}`;
  const addresses = [
    `${deviceLabel}.${networkLabel}.${domainLabel}.${FQDN_SUFFIX}`,
    `${deviceLabel}.${domainLabel}.${FQDN_SUFFIX}`,
  ];
  const ip = device.ip_address?.trim().split("/")[0];
  if (ip) addresses.push(ip);

  const signed = await signHost(pki, domain.pki_zone!, {
    fqdn,
    addresses,
    opensshHostPubkey: hostPubkey,
    // Same device + same key ⇒ a retry (or an idempotent renew of an
    // unchanged key) returns the existing certificate instead of burning a
    // serial.
    idempotencyKey: `${device.id}-${(await sha256Hex(hostPubkey)).slice(0, 32)}`,
    validForSeconds: HOST_CERT_VALID_SECONDS,
  });

  const result: Record<string, unknown> = {
    fqdn,
    host_principals: [fqdn, ...addresses],
    host_cert: signed.certOpenssh.endsWith("\n") ? signed.certOpenssh : `${signed.certOpenssh}\n`,
    host_cert_serial: signed.serial,
    host_cert_valid_before: signed.validBefore,
    host_id: signed.hostId,
    sshd_config: await hostSshdConfig(pki, signed.hostId),
    krl_supported: ecies,
  };
  if (!ecies) {
    result.warnings = [
      "host key is not ecdsa-sha2-nistp256: pki-manager's encrypted per-host " +
        "KRL channel is P-256 only, so this gateway cannot receive revocations " +
        "over it (decision-028 §6)",
    ];
  }
  return result;
}

async function recordPermanentEnrollment(
  device: DeviceRow,
  hostPubkey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await recordEnrollment(device.id, {
    ssh_host_id: payload.host_id as string,
    ssh_host_fqdn: payload.fqdn as string,
    ssh_host_key_fingerprint: await opensshFingerprint(hostPubkey),
    // Retain the full pubkey so a future renew/re-enroll can prove possession
    // of THIS key. On a key rotation this rolls forward to the new key.
    ssh_host_pubkey: hostPubkey,
    ssh_host_cert_serial: String(payload.host_cert_serial),
    ssh_host_cert_valid_before: payload.host_cert_valid_before as string,
    ssh_ca_enrolled_at: new Date().toISOString(),
  });
}

// ── action → decision-033 §3 purpose ────────────────────────────────────────
const ACTION_PURPOSE: Record<string, DeviceAuthPurpose> = {
  trust: "ssh-trust",
  enroll: "ssh-enroll",
  "live-enroll": "ssh-live-enroll",
};

/** trust / enroll / live-enroll — the code-envelope path (unchanged wire format). */
async function handleEnvelope(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const deviceId = url.searchParams.get("device_id") ?? "";

  if (!deviceId) {
    return json({ error: "device_id query parameter is required" }, 400);
  }

  // ── 1. resolve the device, its network and its domain ────────────────────
  let device: DeviceRow;
  try {
    device = await fetchDeviceRow<DeviceRow>(REST, deviceId, DEVICE_SELECT);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error(`Device lookup failed for ${deviceId}: ${details}`);
    return json({ error: "Unable to resolve device", details }, 400);
  }

  const domain = device.network?.domain;
  if (!device.network || !domain) {
    return json({ error: "Device network or domain information is missing" }, 400);
  }

  // ── 2. authenticate: only the device (which was given today's code by an
  //      operator) can produce a usable ciphertext ──────────────────────────
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.byteLength < 20) {
    return json(
      { error: "Request body is required and must be encrypted binary data" },
      400,
    );
  }

  const decrypted = await decryptDeviceRequest(body, device.id);
  if (decrypted instanceof Response) return decrypted;

  let request: {
    device_id?: string;
    action?: string;
    host_pubkey?: string;
  };
  try {
    request = JSON.parse(decrypted.plaintext);
  } catch (error) {
    return json(
      {
        error: "Decrypted payload is not valid JSON",
        details: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }

  // The device_id is authenticated by the query parameter (it selected which
  // device's candidate codes were fetched); requiring the body to agree stops
  // a caller from having one device's code applied to another device's row.
  if (request.device_id && request.device_id !== deviceId) {
    return json({ error: "Device ID in payload does not match query parameter" }, 400);
  }

  const action = (request.action ?? "enroll").toLowerCase();
  const purpose = ACTION_PURPOSE[action];
  if (!purpose) {
    return json({ error: "action must be 'enroll', 'trust' or 'live-enroll'" }, 400);
  }

  // ── 3. consume the code NOW, before any reply is built (fail closed) ─────
  const consumed = await consumeDeviceOtp(device.id, decrypted.seedId, purpose, decrypted.step);
  if (!consumed) {
    return json({ error: "code already used — get a new code from the UI" }, 401);
  }
  const code = decrypted.code;

  // ── 4. the domain must be linked to a pki-manager zone — fail closed ─────
  if (!domain.pki_zone || !domain.pki_user_ca_id || !domain.pki_host_ca_id) {
    return json(
      {
        error: "Domain is not linked to a pki-manager zone",
        details:
          `Domain '${domain.name}' has no pki_zone/CA ids. Link it before enrolling ` +
          `gateways (decision-026 phase 0).`,
      },
      409,
    );
  }

  let pki: PkiConfig;
  try {
    pki = pkiConfigFromEnv(denoEnv);
  } catch (error) {
    console.error(error);
    return json({ error: "PKI is not configured on this deployment" }, 503);
  }

  // ── 5. build the response bundle ─────────────────────────────────────────
  let payload: Record<string, unknown>;
  try {
    payload = { action, ...(await buildTrustBundle(pki, domain)) };

    if (action === "live-enroll") {
      const { key: hostPubkey } = normalizeHostPubkey(request.host_pubkey);
      const deviceLabel = label(device.name);
      const networkLabel = label(device.network.name);
      const domainLabel = label(domain.name);

      // A SEPARATE pki-manager host record from the permanent one: `live-` FQDN,
      // same uuid slice for uniqueness (decision-028 §10). sign-host upserts by
      // (zone, fqdn) and replaces the key, so every boot re-signs this record's
      // new per-boot key without ever touching the device's real host record.
      // No IP principal: the VPN IP belongs to the permanent identity (task-102
      // offboards by it), and clients pin the FQDN with HostKeyAlias anyway.
      // No continuity proof: the live key is per-boot by design; possession of
      // a one-time operator code is the whole bar here, as for a first enroll
      // on the isolated provisioning bench (decision-028 §5).
      const fqdn =
        `live-${deviceLabel}-${device.id.slice(0, 8)}.${networkLabel}.${domainLabel}.${FQDN_SUFFIX}`;
      const signed = await signHost(pki, domain.pki_zone, {
        fqdn,
        addresses: [`live-${deviceLabel}.${networkLabel}.${domainLabel}.${FQDN_SUFFIX}`],
        opensshHostPubkey: hostPubkey,
        idempotencyKey: `live-${device.id}-${(await sha256Hex(hostPubkey)).slice(0, 32)}`,
        validForSeconds: LIVE_HOST_CERT_VALID_SECONDS,
      });

      payload.fqdn = fqdn;
      payload.host_principals = [
        fqdn,
        `live-${deviceLabel}.${networkLabel}.${domainLabel}.${FQDN_SUFFIX}`,
      ];
      payload.host_cert = signed.certOpenssh.endsWith("\n")
        ? signed.certOpenssh
        : `${signed.certOpenssh}\n`;
      payload.host_cert_serial = signed.serial;
      payload.host_cert_valid_before = signed.validBefore;
      payload.host_key_fingerprint = await opensshFingerprint(hostPubkey);
    }

    if (action === "enroll") {
      // First enrollment ONLY. A device that already has an enrolled host key
      // must use "renew" (proves possession of that key) — or the operator
      // uses Reset SSH enrollment in the UI after a reinstall (decision-033 §5).
      if (device.ssh_host_pubkey && device.ssh_host_pubkey.trim()) {
        return json(
          {
            error: "device already enrolled",
            details:
              "renew with the host key (action renew), or use Reset SSH enrollment " +
              "in the UI after a reinstall",
          },
          409,
        );
      }

      const { key: hostPubkey, ecies } = normalizeHostPubkey(request.host_pubkey);
      Object.assign(payload, await signPermanentHost(pki, domain, device, hostPubkey, ecies));
      await recordPermanentEnrollment(device, hostPubkey, payload);
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error(`ssh-ca ${action} failed for device ${device.id}: ${details}`);
    return json(
      { error: `SSH CA ${action} failed`, details },
      error instanceof PkiError ? 502 : 400,
    );
  }

  // ── 6. reply through the same code envelope ──────────────────────────────
  const encrypted = await encryptPayload(JSON.stringify(payload), code);
  return new Response(encrypted as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": encrypted.byteLength.toString(),
    },
  });
}

interface RenewRequest {
  device_id?: string;
  action?: string;
  host_pubkey?: string;
  ts?: number;
  sig?: string;
}

/**
 * "renew" — plain JSON, no one-time code. The gateway proves possession of
 * the CURRENTLY enrolled host private key by signing
 * `<device_id>\n<normalized host_pubkey>\n<ts>` (SSHSIG, namespace
 * `iotgw-renew`); we verify it against `devices.ssh_host_pubkey` and require
 * `ts` fresh and monotonically increasing (`consume_device_renew`). The
 * reply is public certificate material only, so it is not encrypted
 * (decision-033 §5).
 */
async function handleRenew(req: Request): Promise<Response> {
  let body: RenewRequest;
  try {
    body = (await req.json()) as RenewRequest;
  } catch (error) {
    return json(
      {
        error: "Request body is not valid JSON",
        details: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }

  if ((body.action ?? "").toLowerCase() !== "renew") {
    return json({ error: "action must be 'renew' for an application/json request" }, 400);
  }
  const deviceId = (body.device_id ?? "").trim();
  if (!deviceId) {
    return json({ error: "device_id is required" }, 400);
  }
  if (typeof body.ts !== "number" || !Number.isFinite(body.ts)) {
    return json({ error: "ts (unix seconds) is required" }, 400);
  }
  if (typeof body.sig !== "string" || !body.sig.trim()) {
    return json({ error: "sig is required" }, 400);
  }

  let device: DeviceRow;
  try {
    device = await fetchDeviceRow<DeviceRow>(REST, deviceId, DEVICE_SELECT);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error(`Device lookup failed for ${deviceId}: ${details}`);
    return json({ error: "Unable to resolve device", details }, 400);
  }

  const domain = device.network?.domain;
  if (!device.network || !domain) {
    return json({ error: "Device network or domain information is missing" }, 400);
  }

  if (!device.ssh_host_pubkey || !device.ssh_host_pubkey.trim()) {
    return json(
      {
        error: "device is not enrolled",
        details: "use action 'enroll' with an operator one-time code first",
      },
      409,
    );
  }

  let hostPubkey: string;
  let ecies: boolean;
  try {
    ({ key: hostPubkey, ecies } = normalizeHostPubkey(body.host_pubkey));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }

  if (!withinTimeWindow(body.ts, RENEW_TS_WINDOW_SECONDS)) {
    return json({ error: "renew timestamp is outside the acceptable window" }, 401);
  }

  const message = new TextEncoder().encode(`${deviceId}\n${hostPubkey}\n${body.ts}`);
  const validSig = await verifySshSig({
    armored: body.sig,
    expectedPubkeyLine: device.ssh_host_pubkey,
    namespace: "iotgw-renew",
    message,
  });
  if (!validSig) {
    return json({ error: "invalid renew signature" }, 401);
  }

  // Replay guard — consumed only after the signature verifies, so a probe
  // with a garbage signature never burns a legitimate future renewal window.
  const consumed = await consumeDeviceRenew(device.id, body.ts);
  if (!consumed) {
    return json({ error: "stale or replayed renew" }, 401);
  }

  if (!domain.pki_zone || !domain.pki_user_ca_id || !domain.pki_host_ca_id) {
    return json(
      {
        error: "Domain is not linked to a pki-manager zone",
        details:
          `Domain '${domain.name}' has no pki_zone/CA ids. Link it before enrolling ` +
          `gateways (decision-026 phase 0).`,
      },
      409,
    );
  }

  let pki: PkiConfig;
  try {
    pki = pkiConfigFromEnv(denoEnv);
  } catch (error) {
    console.error(error);
    return json({ error: "PKI is not configured on this deployment" }, 503);
  }

  try {
    const payload: Record<string, unknown> = {
      action: "renew",
      ...(await buildTrustBundle(pki, domain)),
    };
    Object.assign(payload, await signPermanentHost(pki, domain, device, hostPubkey, ecies));
    await recordPermanentEnrollment(device, hostPubkey, payload);

    return json(payload, 200);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error(`ssh-ca renew failed for device ${device.id}: ${details}`);
    return json(
      { error: "SSH CA renew failed", details },
      error instanceof PkiError ? 502 : 400,
    );
  }
}

serve(async (req: Request) => {
  try {
    const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
    if (contentType.includes("application/json")) {
      return await handleRenew(req);
    }
    return await handleEnvelope(req);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error("ssh-ca request failed:", details);
    return json({ error: "Failed to process request", details }, 500);
  }
});
