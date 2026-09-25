// vpn — one-time-code-authenticated delivery of a device's WireGuard
// configuration.
//
// See decision-033 (supersedes decision-009's browser/gateway-derived TOTP).
// The code is no longer derived by the client: it comes from a random
// per-device seed held only in Cosmian KMS, read only by the iotgw-ui
// backend. This function asks the backend for the codes valid right now
// (`_shared/device-auth.ts` → `authenticateDevice`) and tries each against
// the request's OpenSSL envelope; success consumes the code so it can never
// be reused. The OpenSSL-compatible AES-256-CBC envelope primitives are
// unchanged and still come from `../_shared/device-auth.ts` so this function
// and `ssh-ca` cannot drift apart (decision-025 §B).
//
// AUTHENTICATION FLOW
//   1. the client passes device_id as a query parameter
//   2. the server asks the backend for the codes valid for that device right now
//   3. the server tries to decrypt the body with each of them
//   4. a successful decryption IS the authentication; the code is consumed
//
// REPLY SEALING (decision-033 §4)
//   If the decrypted request carries `reply_key` (a base64 32-byte X25519
//   public key the gateway generated for this call), the reply is JSON,
//   sealed to that key (`sealVpnReply`) — never to the 6-digit code. A
//   request WITHOUT `reply_key` still gets the legacy code-encrypted reply,
//   logged as deprecated, until every live image in use has been redeployed.
//
// QUERY PARAMETERS
//   device_id   required, format "<name>@<networkPrefix>"
//   download    optional, "true" for a Content-Disposition attachment (legacy
//               reply only)
//
// PAYLOAD (encrypted with the one-time code as the password)
//   device_id   must match the query parameter
//   gateway     optional, default "10.2.0.1"
//   interface   optional, default "eth0"
//   reply_key   optional, base64 32-byte X25519 public key — requests a
//               sealed JSON reply instead of the legacy code-encrypted one
//
// EXAMPLE (legacy reply, no reply_key)
//   CODE=123456; DEVICE_ID="iotgw-m3v6@da9148f6"
//   echo '{"gateway":"10.2.0.1","interface":"eth0","device_id":"'"$DEVICE_ID"'"}' |
//     openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:${CODE} > /tmp/req.enc
//   curl "$KONG/functions/v1/vpn?device_id=${DEVICE_ID}" \
//     -H 'Content-Type: application/octet-stream' --data-binary @/tmp/req.enc -o /tmp/res.enc
//   openssl enc -d -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:${CODE} -in /tmp/res.enc

import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import {
  authenticateDevice,
  fetchDeviceRow,
  encryptPayload,
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
) => `# WireGuard VPN Configuration File, device_id: ${device_id}
# Device metadata
# Name: ${device.name}
# Network ID: ${device.network_id}
# Network: ${device.network?.ipv4_cidr ?? "n/a"}
# Description: ${device.description ?? "n/a"}
# Last updated: ${device.updated_at}

[Interface]
Address = ${formatDeviceAddress(device.ip_address)}
PrivateKey = ${device.private_key}
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

serve(async (req: Request) => {
  const url = new URL(req.url);

  let gateway = "10.2.0.1";
  let iface = "eth0";
  let deviceRecord: DeviceRecord | null = null;

  try {
    const device_id = url.searchParams.get("device_id") ?? "";
    if (!device_id) {
      return jsonError({ error: "device_id query parameter is required" }, 400);
    }

    console.log(`Received device_id: ${device_id}`);

    try {
      deviceRecord = await fetchDeviceRow<DeviceRecord>(REST, device_id, DEVICE_SELECT);
    } catch (lookupError) {
      const details =
        lookupError instanceof Error ? lookupError.message : String(lookupError);
      console.error(`Device lookup failed for ${device_id}:`, details);
      return jsonError({ error: "Unable to fetch device keys", details }, 400);
    }

    if (!deviceRecord.private_key || !deviceRecord.public_key) {
      return jsonError(
        {
          error: "Unable to fetch device keys",
          details:
            "Device keys are missing. Ensure the device has private_key and public_key values.",
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
    const { code, plaintext } = authResult;

    let jsonData: {
      gateway?: string;
      interface?: string;
      device_id?: string;
      reply_key?: string;
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
      console.log(`Device ID mismatch: query=${device_id}, payload=${jsonData.device_id}`);
      return jsonError(
        { error: "Device ID in payload does not match query parameter" },
        400,
      );
    }

    console.log(`Authentication successful for device: ${deviceRecord.id}`);

    const wireguardConfig = generateWireGuardConfig(
      gateway,
      iface,
      device_id,
      deviceRecord,
    );

    // VPN configuration ONLY. SSH trust / host identity is a separate API
    // (`ssh-ca`) and a separate boot step — the combined `?with_ssh_ca=true`
    // bundle was removed on purpose (decision-031): VPN and PKI must fail, be
    // diagnosed and evolve independently.
    const responseBody = wireguardConfig;

    if (jsonData.reply_key) {
      let sealed;
      try {
        sealed = await sealVpnReply(responseBody, jsonData.reply_key, device_id);
      } catch (sealError) {
        const details = sealError instanceof Error ? sealError.message : String(sealError);
        console.error(`Failed to seal vpn reply for device ${deviceRecord.id}:`, details);
        return jsonError({ error: "Invalid reply_key", details }, 400);
      }
      return new Response(JSON.stringify(sealed), {
        headers: { "Content-Type": "application/json" },
      });
    }

    console.warn("deprecated unsealed vpn reply");
    const encryptedConfig = await encryptPayload(responseBody, code);
    const download = url.searchParams.get("download") === "true";

    return new Response(encryptedConfig as unknown as BodyInit, {
      headers: new Headers({
        "Content-Type": "application/octet-stream",
        "Content-Disposition": download
          ? `attachment; filename="wg0.conf.enc"`
          : "inline",
        "Content-Length": encryptedConfig.byteLength.toString(),
      }),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return jsonError({ error: "Failed to process request", details }, 500);
  }
});
