// vpn — one-time-code-authenticated delivery of a device's WireGuard
// configuration.
//
// See decision-033 (supersedes decision-009's browser/gateway-derived TOTP)
// and decision-035 (TLS on the device API + gateway-held WireGuard keys,
// task-135's removal of the legacy code-encrypted reply). The code is not
// derived by the client: it comes from a random per-device seed held only in
// Cosmian KMS, read only by the iotgw-ui backend. This function asks the
// backend for the codes valid right now (`_shared/device-auth.ts` →
// `authenticateDevice`) and tries each against the request's OpenSSL
// envelope; success consumes the code so it can never be reused. The
// OpenSSL-compatible AES-256-CBC envelope primitives are unchanged and still
// come from `../_shared/device-auth.ts` so this function and `ssh-ca` cannot
// drift apart (decision-025 §B).
//
// AUTHENTICATION FLOW
//   1. the client passes device_id as a query parameter
//   2. the server asks the backend for the codes valid for that device right now
//   3. the server tries to decrypt the body with each of them
//   4. a successful decryption IS the authentication; the code is consumed
//
// REPLY SEALING (decision-033 §4, mandatory since decision-035/task-135)
//   The decrypted request MUST carry `reply_key` (a base64 32-byte X25519
//   public key the gateway generated for this call); the reply is JSON,
//   sealed to that key (`sealVpnReply`) — never to the 6-digit code. A
//   request WITHOUT `reply_key` is refused with 426 "upgrade required" — the
//   legacy code-encrypted reply path has been removed (task-135; deployed
//   only after every live image in use runs an agent that sends reply_key).
//
// GATEWAY-HELD WIREGUARD KEY (decision-035 §2)
//   The decrypted request MAY carry `wg_public_key` (base64, exactly 32
//   bytes — the gateway's own WireGuard public key). When present:
//     - if it differs from `devices.public_key`, the Netmaker extclient's
//       `publickey` is updated in place (GET then PUT
//       `/api/extclients/{network}/{clientid}`, mirroring the
//       oriolrius.netmaker Ansible module / `netmaker-call`'s
//       `netmakerRequest` helper style — decision-022);
//     - either way (changed or already equal — e.g. a plain refresh) the
//       device row is written back with `public_key = wg_public_key` and
//       `private_key = null`: the gateway now holds its own private key, so
//       the server must stop holding (and stop returning) one;
//     - the returned WireGuard config OMITS the `PrivateKey =` line
//       (replaced with a `# PrivateKey: held by the gateway` comment) — the
//       gateway inserts its own key before applying the config.
//   A Netmaker failure returns 502 WITHOUT writing to the DB. A DB write-back
//   failure AFTER a successful Netmaker update is logged loudly but does NOT
//   fail the request — Netmaker is the source of truth for the tunnel, and
//   the gateway already has everything it needs from this reply.
//   A request WITHOUT `wg_public_key` only succeeds if the device still has a
//   server-held private key (`devices.private_key` not null); once a device
//   has switched to a gateway-held key, a keyless legacy request is refused
//   with 409 — the gateway agent must be updated.
//
// QUERY PARAMETERS
//   device_id   required, format "<name>@<networkPrefix>"
//
// PAYLOAD (encrypted with the one-time code as the password)
//   device_id       must match the query parameter
//   gateway         optional, default "10.2.0.1"
//   interface       optional, default "eth0"
//   reply_key       REQUIRED, base64 32-byte X25519 public key — the reply is
//                   sealed JSON (see above); its absence is 426.
//   wg_public_key   optional, base64 32-byte WireGuard public key generated
//                   and held by the gateway (see above).
//
// EXAMPLE
//   CODE=123456; DEVICE_ID="iotgw-m3v6@da9148f6"
//   echo '{"gateway":"10.2.0.1","interface":"eth0","device_id":"'"$DEVICE_ID"'","reply_key":"'"$REPLY_KEY_B64"'","wg_public_key":"'"$WG_PUBKEY_B64"'"}' |
//     openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:${CODE} > /tmp/req.enc
//   curl "$KONG/functions/v1/vpn?device_id=${DEVICE_ID}" \
//     -H 'Content-Type: application/octet-stream' --data-binary @/tmp/req.enc -o /tmp/res.json
//   # /tmp/res.json is the sealed JSON reply — unseal with the gateway's
//   # ephemeral X25519 private key (see sealVpnReply / decision-033 §4).

import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import {
  authenticateDevice,
  base64ToBytes,
  fetchDeviceRow,
  restHeaders,
  sealVpnReply,
  type SupabaseRestConfig,
} from "../_shared/device-auth.ts";

type DenoEnv = { env: { get(key: string): string | undefined } };
const denoEnv = (globalThis as { Deno?: DenoEnv }).Deno?.env;

const SUPABASE_URL = denoEnv?.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = denoEnv?.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase configuration for vpn function");
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const REST: SupabaseRestConfig = {
  url: SUPABASE_URL,
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
};

// Netmaker configuration — credentials come from the environment ONLY, same
// convention as netmaker-call (decision-014): no hardcoded fallback, a
// missing master key fails loudly (every Netmaker call gets a 401 from
// Netmaker, surfaced to the caller as a 502) rather than shipping a real key
// baked into source.
const NETMAKER_BASE_URL = denoEnv?.get("NETMAKER_BASE_URL") || "https://api.netmaker.i40sys.com";
const NETMAKER_MASTER_KEY = denoEnv?.get("NETMAKER_MASTER_KEY") || "";
if (!NETMAKER_MASTER_KEY) {
  console.error("FATAL: NETMAKER_MASTER_KEY is not set — Netmaker key updates will fail with 502");
}

const SERVER_PUBLIC_KEY = "MVrf5pB0sPD9pQjV62NDxJNfBuJj2borv9kv8Ba4NiY=";

interface DeviceRecord {
  id: string;
  network_id: string;
  name: string;
  description: string | null;
  ip_address: string | null;
  private_key: string | null;
  public_key: string | null;
  created_at: string;
  updated_at: string;
  network: {
    id: string;
    ipv4_cidr: string | null;
  } | null;
}

const DEVICE_SELECT =
  "id,network_id,name,description,ip_address,private_key,public_key," +
  "created_at,updated_at," +
  "network:networks(id,ipv4_cidr)";

const formatDeviceAddress = (ip: string | null | undefined) => {
  const trimmed = ip?.trim();
  if (!trimmed) return "10.121.102.62/32";
  return trimmed.includes("/") ? trimmed : `${trimmed}/32`;
};

const generateWireGuardConfig = (
  gateway: string,
  iface: string,
  device_id: string,
  device: DeviceRecord,
  gatewayHeld: boolean,
) => `# WireGuard VPN Configuration File, device_id: ${device_id}
# Device metadata
# Name: ${device.name}
# Network ID: ${device.network_id}
# Network: ${device.network?.ipv4_cidr ?? "n/a"}
# Description: ${device.description ?? "n/a"}
# Last updated: ${device.updated_at}

[Interface]
Address = ${formatDeviceAddress(device.ip_address)}
${gatewayHeld ? "# PrivateKey: held by the gateway" : `PrivateKey = ${device.private_key}`}
MTU = 1420
# DevicePublicKey = ${device.public_key}

# Route configuration for public IP
PreUp = ip route del default || true
PreUp = ip route add 216.45.62.117 via ${gateway} dev ${iface} || true
PostDown = ip route del 216.45.62.117 via ${gateway} dev ${iface} || true
PostDown = ip route add default via ${gateway} || true

[Peer]
PublicKey = ${SERVER_PUBLIC_KEY}
Endpoint = 216.45.62.117:443
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 20
`;

const jsonError = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// -----------------------------------------------------------------------
// isBase64Of32Bytes — strict validation shared by wg_public_key and
// reply_key: both are base64-encoded 32-byte keys (WireGuard Curve25519 /
// X25519 respectively). Malformed base64 (atob throws) or a decoded length
// other than exactly 32 bytes is rejected.
// -----------------------------------------------------------------------
function isBase64Of32Bytes(value: string): boolean {
  try {
    return base64ToBytes(value).length === 32;
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------
// netmakerRequest — thin HTTP helper mirroring netmaker-call/index.ts's
// helper of the same name, which in turn mirrors the response-handling logic
// of the oriolrius.netmaker Ansible module (reference spec, external repo:
// github.com/oriolrius/netmaker-ansible-automation — decision-022):
//   404 → null (not found, do not throw)
//   204 → true (no content)
//   500 with .Message === 'no result found' → null (Netmaker "doesn't exist")
//   other !ok → throw Error with .Message from body
//   ok → parsed JSON (or true when the body is empty)
// All calls go to ${NETMAKER_BASE_URL}/api${endpoint}.
// -----------------------------------------------------------------------
async function netmakerRequest(
  method: string,
  endpoint: string,
  body: Record<string, unknown> | undefined,
  txId: string,
): Promise<unknown> {
  const url = `${NETMAKER_BASE_URL}/api${endpoint}`;
  const logPrefix = `[${txId}][netmakerRequest]`;

  console.log(`${logPrefix} ${method} ${url}`);

  const fetchOptions: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${NETMAKER_MASTER_KEY}`,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  const res = await fetch(url, fetchOptions);
  console.log(`${logPrefix} response status: ${res.status}`);

  if (res.status === 404) {
    console.log(`${logPrefix} 404 — treating as not found (null)`);
    return null;
  }

  if (res.status === 204) {
    console.log(`${logPrefix} 204 — successful (no content)`);
    return true;
  }

  if (res.status === 500) {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = (await res.json()) as Record<string, unknown>;
    } catch {
      // body not JSON — fall through to the generic error path below
    }
    if (parsed.Message === "no result found") {
      console.log(`${logPrefix} 500 "no result found" — treating as not found (null)`);
      return null;
    }
    throw new Error(`Netmaker API error ${res.status}: ${parsed.Message || JSON.stringify(parsed)}`);
  }

  if (!res.ok) {
    let errMessage = `HTTP ${res.status}`;
    try {
      const errBody = (await res.json()) as Record<string, unknown>;
      if (errBody.Message) errMessage = `${errMessage}: ${errBody.Message}`;
    } catch {
      const errText = await res.text().catch(() => "");
      if (errText) errMessage = `${errMessage}: ${errText}`;
    }
    throw new Error(`Netmaker API error — ${errMessage}`);
  }

  const text = await res.text();
  if (!text || text.trim() === "") {
    return true;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// -----------------------------------------------------------------------
// updateNetmakerExtclientKey — decision-035 §2: GET the extclient, then PUT
// it back with only `publickey` changed, copying every other field verbatim
// (VERIFIED: Netmaker v1.0 returns 200 and persists the new publickey on
// this exact field set). Throws (never returns null) on any failure,
// including "extclient not found" — the caller turns that into a 502.
// -----------------------------------------------------------------------
async function updateNetmakerExtclientKey(
  networkId: string,
  deviceId: string,
  newPublicKeyB64: string,
  txId: string,
): Promise<void> {
  const network = networkId.replaceAll("-", "");
  const clientid = deviceId.replaceAll("-", "");

  console.log(`[${txId}][updateNetmakerExtclientKey] clientid=${clientid} network=${network}`);

  const existing = await netmakerRequest("GET", `/extclients/${network}/${clientid}`, undefined, txId);
  if (!existing || typeof existing !== "object") {
    throw new Error(`extclient ${clientid} not found in network ${network}`);
  }
  const ext = existing as Record<string, unknown>;

  const putBody = {
    clientid: ext.clientid ?? clientid,
    publickey: newPublicKeyB64,
    dns: ext.dns,
    extraallowedips: ext.extraallowedips,
    enabled: ext.enabled,
    deniednodeacls: ext.deniednodeacls,
    postup: ext.postup,
    postdown: ext.postdown,
    tags: ext.tags,
    remote_access_client_id: ext.remote_access_client_id,
  };

  await netmakerRequest("PUT", `/extclients/${network}/${clientid}`, putBody, txId);
  console.log(`[${txId}][updateNetmakerExtclientKey] extclient publickey updated`);
}

// -----------------------------------------------------------------------
// patchDeviceKeys — write `public_key` / `private_key: null` back to the
// devices row via PostgREST. Called AFTER any Netmaker update has already
// succeeded; a failure here is logged loudly by the caller but must not fail
// the request (Netmaker already holds the authoritative tunnel state).
// -----------------------------------------------------------------------
async function patchDeviceKeys(
  cfg: SupabaseRestConfig,
  deviceId: string,
  publicKey: string,
): Promise<void> {
  const url = `${cfg.url}/rest/v1/devices?id=eq.${deviceId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...restHeaders(cfg), Prefer: "return=minimal" },
    body: JSON.stringify({ public_key: publicKey, private_key: null }),
  });
  if (!res.ok) {
    throw new Error(`PATCH devices failed (status ${res.status}): ${await res.text()}`);
  }
}

// -----------------------------------------------------------------------
// handleVpnRequest — the request handler, exported so tests can drive it
// directly with a mocked global `fetch` instead of a live server.
// -----------------------------------------------------------------------
export async function handleVpnRequest(req: Request): Promise<Response> {
  const transactionId = crypto.randomUUID();
  const txId = transactionId.substring(0, 8);

  const url = new URL(req.url);

  let gateway = "10.2.0.1";
  let iface = "eth0";
  let deviceRecord: DeviceRecord | null = null;

  try {
    const device_id = url.searchParams.get("device_id") ?? "";
    if (!device_id) {
      return jsonError({ error: "device_id query parameter is required" }, 400);
    }

    console.log(`[${txId}] Received device_id: ${device_id}`);

    try {
      deviceRecord = await fetchDeviceRow<DeviceRecord>(REST, device_id, DEVICE_SELECT);
    } catch (lookupError) {
      const details =
        lookupError instanceof Error ? lookupError.message : String(lookupError);
      console.error(`[${txId}] Device lookup failed for ${device_id}:`, details);
      return jsonError({ error: "Unable to fetch device keys", details }, 400);
    }

    // Only `public_key` is required up front. `private_key` may legitimately
    // be null (decision-035 §2: the device's key is gateway-held) — that
    // case is handled below, once we know whether this request carries
    // wg_public_key.
    if (!deviceRecord.public_key) {
      return jsonError(
        {
          error: "Unable to fetch device keys",
          details: "Device key is missing. Ensure the device has a public_key value.",
        },
        400,
      );
    }

    const bodyBuffer = await req.arrayBuffer();
    if (!bodyBuffer || bodyBuffer.byteLength === 0) {
      return jsonError(
        { error: "Request body is required and must be encrypted binary data" },
        400,
      );
    }
    const encryptedData = new Uint8Array(bodyBuffer);
    if (encryptedData.length < 20) {
      return jsonError(
        { error: "Request body is too small to be valid encrypted data" },
        400,
      );
    }

    const authResult = await authenticateDevice(encryptedData, deviceRecord.id, "vpn");
    if (authResult instanceof Response) {
      return authResult;
    }
    const { plaintext } = authResult;

    let jsonData: {
      gateway?: string;
      interface?: string;
      device_id?: string;
      reply_key?: string;
      wg_public_key?: string;
    };
    try {
      jsonData = JSON.parse(plaintext);
    } catch (parseError) {
      return jsonError(
        {
          error: "Decrypted payload is not valid JSON",
          details: parseError instanceof Error ? parseError.message : String(parseError),
        },
        400,
      );
    }

    gateway = jsonData.gateway || gateway;
    iface = jsonData.interface || iface;

    if (jsonData.device_id && jsonData.device_id !== device_id) {
      console.log(`[${txId}] Device ID mismatch: query=${device_id}, payload=${jsonData.device_id}`);
      return jsonError(
        { error: "Device ID in payload does not match query parameter" },
        400,
      );
    }

    console.log(`[${txId}] Authentication successful for device: ${deviceRecord.id}`);

    // task-135 / decision-035: reply_key is now mandatory. The legacy
    // code-encrypted reply path is removed — a caller that doesn't send
    // reply_key is running an agent older than v0.3.0.
    if (!jsonData.reply_key) {
      return jsonError(
        { error: "upgrade required: send reply_key (iotgw agent >= v0.3.0)" },
        426,
      );
    }
    if (!isBase64Of32Bytes(jsonData.reply_key)) {
      return jsonError(
        { error: "Invalid reply_key", details: "reply_key must be a base64-encoded 32-byte X25519 public key" },
        400,
      );
    }

    // decision-035 §2: gateway-held WireGuard key.
    let gatewayHeld = false;

    if (jsonData.wg_public_key) {
      if (!isBase64Of32Bytes(jsonData.wg_public_key)) {
        return jsonError(
          {
            error: "Invalid wg_public_key",
            details: "wg_public_key must be a base64-encoded 32-byte WireGuard public key",
          },
          400,
        );
      }

      gatewayHeld = true;
      const newPublicKey = jsonData.wg_public_key;

      if (newPublicKey !== deviceRecord.public_key) {
        try {
          await updateNetmakerExtclientKey(deviceRecord.network_id, deviceRecord.id, newPublicKey, txId);
        } catch (netErr) {
          const details = netErr instanceof Error ? netErr.message : String(netErr);
          console.error(
            `[${txId}] Netmaker extclient key update failed for device ${deviceRecord.id}:`,
            details,
          );
          // On Netmaker failure, return 502 WITHOUT touching the DB.
          return jsonError({ error: "Failed to update WireGuard key in Netmaker", details }, 502);
        }
      }

      // Netmaker is now (or was already) authoritative for this publickey —
      // write it back and clear the server-held private key. A failure here
      // must NOT fail the request: Netmaker already holds the truth, and the
      // gateway already generated the key it needs.
      try {
        await patchDeviceKeys(REST, deviceRecord.id, newPublicKey);
      } catch (patchErr) {
        console.error(
          `[${txId}] FAILED to write back public_key/private_key=null for device ` +
            `${deviceRecord.id} after Netmaker succeeded — devices row is stale until the ` +
            `next successful vpn request:`,
          patchErr,
        );
      }

      deviceRecord.public_key = newPublicKey;
      deviceRecord.private_key = null;
    } else {
      if (deviceRecord.private_key === null) {
        return jsonError(
          { error: "this device's WireGuard key is held by the gateway; update the gateway agent" },
          409,
        );
      }
    }

    const wireguardConfig = generateWireGuardConfig(
      gateway,
      iface,
      device_id,
      deviceRecord,
      gatewayHeld,
    );

    // VPN configuration ONLY. SSH trust / host identity is a separate API
    // (`ssh-ca`) and a separate boot step — the combined `?with_ssh_ca=true`
    // bundle was removed on purpose (decision-031): VPN and PKI must fail, be
    // diagnosed and evolve independently.
    const responseBody = wireguardConfig;

    let sealed;
    try {
      sealed = await sealVpnReply(responseBody, jsonData.reply_key, device_id);
    } catch (sealError) {
      const details = sealError instanceof Error ? sealError.message : String(sealError);
      console.error(`[${txId}] Failed to seal vpn reply for device ${deviceRecord.id}:`, details);
      return jsonError({ error: "Invalid reply_key", details }, 400);
    }
    return new Response(JSON.stringify(sealed), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return jsonError({ error: "Failed to process request", details }, 500);
  }
}

// Only bind a server when this file is the runtime entry point — importing
// it from a test (or another module) must not start listening on a port.
if (import.meta.main) {
  serve(handleVpnRequest);
}
