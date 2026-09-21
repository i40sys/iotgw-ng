// ssh-ca — the only bridge between an IoT gateway and pki-manager.
//
// decision-024 (target architecture), decision-026 (provisioning sequence).
//
// A gateway generates its own SSH host key, proves it is that device with the
// TOTP it already uses to fetch its WireGuard config (decision-009), and gets
// back a host certificate signed by its *domain's* Host CA plus the public
// trust material it needs. The gateway never talks to pki-manager, never sees
// the fleet token, and never sends a private key anywhere.
//
// Two actions:
//   trust   — public trust material only (User CA, Host CA, principals).
//             Safe to call before a host key exists; used by the live image and
//             by migrations that only need to install trust.
//   enroll  — the above plus: sign `host_pubkey` with the domain's Host CA,
//             return the certificate and the sshd drop-in, and record the
//             enrollment on the device row.
//
// Wire format (identical to the `vpn` function so a gateway needs only
// busybox + openssl):
//
//   POST /functions/v1/ssh-ca?device_id=<name>@<networkPrefix>
//   body = openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:$TOTP
//          of {"device_id":"...","action":"enroll","host_pubkey":"ecdsa-... "}
//   response = the same envelope, JSON payload.

import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import {
  authenticateAndDecrypt,
  encryptPayload,
  fetchDeviceRow,
  restHeaders,
  validTotpCodes,
  type SupabaseRestConfig,
} from "../_shared/device-auth.ts";
import {
  hostSshdConfig,
  PkiError,
  pkiConfigFromEnv,
  signHost,
  zoneTrustAnchors,
} from "../_shared/pki-manager.ts";

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

/** The two principals every zone gets (decision-024 §5). */
const PRINCIPALS = ["iotgw-admin", "iotgw-ops"];

/** Private, deliberately non-resolvable namespace; clients pin it with HostKeyAlias. */
const FQDN_SUFFIX = "iotgw";

interface DeviceRow {
  id: string;
  network_id: string;
  name: string;
  ip_address: string | null;
  totp_counter: number;
  network: {
    id: string;
    name: string;
    domain_id: string;
    domain: {
      id: string;
      name: string;
      pki_zone: string | null;
      pki_user_ca_id: string | null;
      pki_host_ca_id: string | null;
    } | null;
  } | null;
}

const DEVICE_SELECT =
  "id,network_id,name,ip_address,totp_counter," +
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
    throw new Error("host_pubkey is required for action 'enroll'");
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

serve(async (req: Request) => {
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

  // ── 2. authenticate: only the device can produce a usable ciphertext ─────
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.byteLength < 20) {
    return json(
      { error: "Request body is required and must be encrypted binary data" },
      400,
    );
  }

  const codes = await validTotpCodes({
    domainId: domain.id,
    networkId: device.network.id,
    deviceId: device.id,
    totpCounter: device.totp_counter,
  });

  const authenticated = await authenticateAndDecrypt(body, codes);
  if (!authenticated) {
    console.warn(`TOTP authentication failed for device ${device.id}`);
    // Deliberately terse: the vpn function echoes the candidate codes and the
    // device's ids on failure, which is a gift to anyone probing. Not repeated.
    return json({ error: "Authentication failed" }, 401);
  }
  const totp = authenticated.code;

  let request: { device_id?: string; action?: string; host_pubkey?: string };
  try {
    request = JSON.parse(authenticated.plaintext);
  } catch (error) {
    return json(
      {
        error: "Decrypted payload is not valid JSON",
        details: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }

  // The device_id is authenticated by the query parameter (it selected the
  // TOTP secret); requiring the body to agree stops a caller from having one
  // device's code applied to another device's row.
  if (request.device_id && request.device_id !== deviceId) {
    return json({ error: "Device ID in payload does not match query parameter" }, 400);
  }

  // ── 3. the domain must be linked to a pki-manager zone — fail closed ─────
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

  let pki;
  try {
    pki = pkiConfigFromEnv(denoEnv);
  } catch (error) {
    console.error(error);
    return json({ error: "PKI is not configured on this deployment" }, 503);
  }

  const action = (request.action ?? "enroll").toLowerCase();
  if (action !== "enroll" && action !== "trust") {
    return json({ error: "action must be 'enroll' or 'trust'" }, 400);
  }

  // ── 4. build the response bundle ─────────────────────────────────────────
  const payload: Record<string, unknown> = {
    action,
    zone: domain.pki_zone,
    domain: domain.name,
    principals: PRINCIPALS,
    auth_principals: PRINCIPALS.join("\n") + "\n",
  };

  try {
    // Zone-scoped anchors return the ACTIVE + any ROTATING CA of each type, so a
    // gateway seeded here keeps trusting either half of a rotating CA pair for
    // the whole overlap window (decision-028 §4) — the id-addressed ca.pub route
    // returned only one CA and would have stranded a late-renewing gateway.
    const { userCaKeys, hostCaKeys } = await zoneTrustAnchors(
      pki,
      domain.pki_zone,
    );
    payload.user_ca = userCaKeys.join("\n") + "\n";
    payload.host_ca = hostCaKeys.join("\n") + "\n";
    // The operator-side trust lines — one @cert-authority per Host CA, so the
    // same bundle can seed a known_hosts across a Host CA rotation too.
    payload.cert_authority = hostCaKeys
      .map((k) => `@cert-authority *.${label(domain.name)}.${FQDN_SUFFIX} ${k}`)
      .join("\n") + "\n";

    if (action === "enroll") {
      const { key: hostPubkey, ecies } = normalizeHostPubkey(request.host_pubkey);

      const deviceLabel = label(device.name);
      const networkLabel = label(device.network.name);
      const domainLabel = label(domain.name);

      // The REGISTERED fqdn carries a slice of the device uuid because
      // pki-manager's offboard is terminal and (zone, fqdn) stays unique
      // forever — a recreated device with the same name would otherwise be
      // permanently un-enrollable (decision-028 §10). The human-facing names
      // are principals instead, which is what clients actually dial.
      const fqdn =
        `${deviceLabel}-${device.id.slice(0, 8)}.${networkLabel}.${domainLabel}.${FQDN_SUFFIX}`;

      const addresses = [
        `${deviceLabel}.${networkLabel}.${domainLabel}.${FQDN_SUFFIX}`,
        `${deviceLabel}.${domainLabel}.${FQDN_SUFFIX}`,
      ];
      const ip = device.ip_address?.trim().split("/")[0];
      if (ip) addresses.push(ip);

      const signed = await signHost(pki, domain.pki_zone, {
        fqdn,
        addresses,
        opensshHostPubkey: hostPubkey,
        // Same device + same key ⇒ same key ⇒ a retry returns the existing
        // certificate instead of burning a serial.
        idempotencyKey: `${device.id}-${(await sha256Hex(hostPubkey)).slice(0, 32)}`,
        validForSeconds: HOST_CERT_VALID_SECONDS,
      });

      payload.fqdn = fqdn;
      payload.host_principals = [fqdn, ...addresses];
      payload.host_cert = signed.certOpenssh.endsWith("\n")
        ? signed.certOpenssh
        : `${signed.certOpenssh}\n`;
      payload.host_cert_serial = signed.serial;
      payload.host_cert_valid_before = signed.validBefore;
      payload.host_id = signed.hostId;
      payload.sshd_config = await hostSshdConfig(pki, signed.hostId);
      payload.krl_supported = ecies;
      if (!ecies) {
        payload.warnings = [
          "host key is not ecdsa-sha2-nistp256: pki-manager's encrypted per-host " +
            "KRL channel is P-256 only, so this gateway cannot receive revocations " +
            "over it (decision-028 §6)",
        ];
      }

      await recordEnrollment(device.id, {
        ssh_host_id: signed.hostId,
        ssh_host_fqdn: fqdn,
        ssh_host_key_fingerprint: await opensshFingerprint(hostPubkey),
        ssh_host_cert_serial: String(signed.serial),
        ssh_host_cert_valid_before: signed.validBefore,
        ssh_ca_enrolled_at: new Date().toISOString(),
      });
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error(`ssh-ca ${action} failed for device ${device.id}: ${details}`);
    return json(
      { error: `SSH CA ${action} failed`, details },
      error instanceof PkiError ? 502 : 400,
    );
  }

  // ── 5. reply through the same TOTP envelope ──────────────────────────────
  const encrypted = await encryptPayload(JSON.stringify(payload), totp);
  return new Response(encrypted as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": encrypted.byteLength.toString(),
    },
  });
});
