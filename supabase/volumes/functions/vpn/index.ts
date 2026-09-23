// vpn — TOTP-authenticated delivery of a device's WireGuard configuration.
//
// See iotgw-ui decision-009 for the authentication model. The TOTP derivation
// and the OpenSSL-compatible AES-256-CBC envelope used to live inline here;
// they now come from `../_shared/device-auth.ts` so this function and `ssh-ca`
// cannot drift apart (decision-025 §B). The wire format is unchanged.
//
// AUTHENTICATION FLOW
//   1. the client passes device_id as a query parameter
//   2. the server derives the codes valid for that device right now
//   3. the server tries to decrypt the body with each of them
//   4. a successful decryption IS the authentication
//   5. the response is encrypted with the same code
//
// QUERY PARAMETERS
//   device_id   required, format "<name>@<networkPrefix>"
//   download    optional, "true" for a Content-Disposition attachment
//
// PAYLOAD (encrypted with the TOTP as the password)
//   device_id   must match the query parameter
//   gateway     optional, default "10.2.0.1"
//   interface   optional, default "eth0"
//
// EXAMPLE
//   TOTP=123456; DEVICE_ID="iotgw-m3v6@da9148f6"
//   echo '{"gateway":"10.2.0.1","interface":"eth0","device_id":"'"$DEVICE_ID"'"}' |
//     openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:${TOTP} > /tmp/req.enc
//   curl "$KONG/functions/v1/vpn?device_id=${DEVICE_ID}" \
//     -H 'Content-Type: application/octet-stream' --data-binary @/tmp/req.enc -o /tmp/res.enc
//   openssl enc -d -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:${TOTP} -in /tmp/res.enc

import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import {
  authenticateAndDecrypt,
  encryptPayload,
  fetchDeviceRow,
  validTotpCodes,
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
  totp_counter: number;
  network: {
    id: string;
    domain_id: string;
    ipv4_cidr: string | null;
    domain: {
      id: string;
      name: string;
    } | null;
  } | null;
}

const DEVICE_SELECT =
  "id,network_id,name,description,ip_address,private_key,public_key," +
  "created_at,updated_at,totp_counter," +
  "network:networks(id,domain_id,ipv4_cidr,domain:domains(id,name))";

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
  let totp_code = "";
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
    const domain = deviceRecord.network?.domain;
    if (!deviceRecord.network || !domain) {
      return jsonError(
        {
          error: "Unable to fetch device keys",
          details: "Device network or domain information is missing.",
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

    const codes = await validTotpCodes({
      domainId: domain.id,
      networkId: deviceRecord.network.id,
      deviceId: deviceRecord.id,
      totpCounter: deviceRecord.totp_counter,
    });

    const authenticated = await authenticateAndDecrypt(encryptedData, codes);
    if (!authenticated) {
      console.error(`TOTP authentication failed for device ${deviceRecord.id}`);
      // Terse on purpose: the previous implementation echoed every candidate
      // code and the device's ids, which handed a prober everything it needed.
      return jsonError({ error: "Authentication failed" }, 401);
    }
    totp_code = authenticated.code;

    let jsonData: { gateway?: string; interface?: string; device_id?: string };
    try {
      jsonData = JSON.parse(authenticated.plaintext);
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

    console.log(`TOTP validation successful for device: ${deviceRecord.id}`);

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

    const encryptedConfig = await encryptPayload(responseBody, totp_code);
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
