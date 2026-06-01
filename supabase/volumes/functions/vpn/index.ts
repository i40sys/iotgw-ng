// Supabase Edge Function to serve WireGuard configuration
// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment

import { serve } from "https://deno.land/std@0.177.1/http/server.ts"

// Function to decrypt AES-256-CBC encrypted binary data
const decryptPayload = async (encryptedData: Uint8Array, password: string): Promise<string> => {
  try {
    // OpenSSL uses "Salted__" prefix (8 bytes) followed by 8 bytes of salt
    if (encryptedData.length < 16 || 
        String.fromCharCode(...encryptedData.slice(0, 8)) !== "Salted__") {
      throw new Error("Invalid encrypted data format");
    }
    
    const salt = encryptedData.slice(8, 16);
    const ciphertext = encryptedData.slice(16);
    
    // Derive key and IV using PBKDF2 (matching OpenSSL's pbkdf2 with 300000 iterations)
    const passwordBytes = new TextEncoder().encode(password);
    
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    
    // Derive 48 bytes (32 for key + 16 for IV)
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 300000,
        hash: "SHA-256"
      },
      keyMaterial,
      48 * 8 // 48 bytes = 384 bits
    );
    
    const derivedBytes = new Uint8Array(derivedBits);
    const key = derivedBytes.slice(0, 32); // 256 bits for AES-256
    const iv = derivedBytes.slice(32, 48);  // 128 bits for CBC IV
    
    // Import the AES key
    const aesKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "AES-CBC", length: 256 },
      false,
      ["decrypt"]
    );
    
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: iv },
      aesKey,
      ciphertext
    );
    
    // Convert to string
    const decryptedText = new TextDecoder().decode(decrypted);
    return decryptedText;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : "UnknownError";
    // Don't log to console.error here to avoid duplicate logs
    throw new Error(`Decryption failed [${errorName}]: ${errorMessage}`);
  }
};

// Function to encrypt data using AES-256-CBC (returns binary data matching OpenSSL format)
const encryptPayload = async (plaintext: string, password: string): Promise<Uint8Array> => {
  try {
    // Generate random salt (8 bytes)
    const salt = crypto.getRandomValues(new Uint8Array(8));
    
    // Derive key and IV using PBKDF2 (matching OpenSSL's pbkdf2 with 300000 iterations)
    const passwordBytes = new TextEncoder().encode(password);
    
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    
    // Derive 48 bytes (32 for key + 16 for IV)
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 300000,
        hash: "SHA-256"
      },
      keyMaterial,
      48 * 8 // 48 bytes = 384 bits
    );
    
    const derivedBytes = new Uint8Array(derivedBits);
    const key = derivedBytes.slice(0, 32); // 256 bits for AES-256
    const iv = derivedBytes.slice(32, 48);  // 128 bits for CBC IV
    
    // Import the AES key
    const aesKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "AES-CBC", length: 256 },
      false,
      ["encrypt"]
    );
    
    // Encrypt
    const plaintextBytes = new TextEncoder().encode(plaintext);
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-CBC", iv: iv },
      aesKey,
      plaintextBytes
    );
    
    // Combine "Salted__" prefix + salt + ciphertext (matching OpenSSL format)
    const saltedPrefix = new TextEncoder().encode("Salted__");
    const combined = new Uint8Array(saltedPrefix.length + salt.length + encrypted.byteLength);
    combined.set(saltedPrefix, 0);
    combined.set(salt, saltedPrefix.length);
    combined.set(new Uint8Array(encrypted), saltedPrefix.length + salt.length);
    
    // Return binary data (no base64 encoding)
    return combined;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Encryption failed:", errorMessage);
    throw new Error(`Encryption failed: ${errorMessage}`);
  }
};

type DenoEnv = { env: { get(key: string): string | undefined } }
const denoEnv = (globalThis as { Deno?: DenoEnv }).Deno?.env

const SUPABASE_URL = denoEnv?.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = denoEnv?.get("SUPABASE_SERVICE_ROLE_KEY")

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase configuration for vpn function")
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
}

interface DeviceRecord {
  id: string
  network_id: string
  name: string
  description: string | null
  ip_address: string | null
  private_key: string
  public_key: string
  created_at: string
  updated_at: string
  totp_counter: number
  domain_id?: string
}

// HMAC-based One-Time Password (HOTP) implementation
const generateHOTP = async (secret: Uint8Array, counter: number, digits: number): Promise<string> => {
  // Convert counter to 8-byte buffer (big-endian)
  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  counterView.setBigUint64(0, BigInt(counter), false); // false = big-endian

  // Import secret key for HMAC-SHA1
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  // Generate HMAC
  const hmac = await crypto.subtle.sign("HMAC", key, counterBuffer);
  const hmacArray = new Uint8Array(hmac);

  // Dynamic truncation (RFC 4226)
  const offset = hmacArray[hmacArray.length - 1] & 0x0f;
  const binary =
    ((hmacArray[offset] & 0x7f) << 24) |
    ((hmacArray[offset + 1] & 0xff) << 16) |
    ((hmacArray[offset + 2] & 0xff) << 8) |
    (hmacArray[offset + 3] & 0xff);

  // Generate OTP
  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, "0");
};

// TOTP validation function - must match frontend implementation
const validateTOTP = async (
  totp_code: string,
  device_id: string,
  network_id: string,
  domain_id: string,
  totp_counter: number
): Promise<boolean> => {
  try {
    // Create the same secret as frontend
    const combinedSecret = `${domain_id}-${network_id}-${device_id}-${totp_counter}`;
    const encoder = new TextEncoder();
    const secret = encoder.encode(combinedSecret);

    // TOTP parameters (must match frontend)
    const period = 600; // 10 minutes in seconds
    const digits = 6;

    // Get current time-based counter
    const currentTime = Math.floor(Date.now() / 1000);
    const currentCounter = Math.floor(currentTime / period);

    // Check current period and adjacent periods (window of ±1 for clock drift)
    // This matches the frontend's behavior when startTime is set to current time
    const window = 1;

    for (let offset = -window; offset <= window; offset++) {
      const testCounter = currentCounter + offset;
      const testOTP = await generateHOTP(secret, testCounter, digits);

      if (testOTP === totp_code) {
        console.log(`TOTP validated for counter: ${testCounter} (offset: ${offset} from ${currentCounter})`);
        return true;
      }
    }

    console.log(`TOTP validation failed. Tested counters: ${currentCounter - window} to ${currentCounter + window}`);
    return false;
  } catch (error) {
    console.error("TOTP validation error:", error);
    return false;
  }
}

const SERVER_PUBLIC_KEY = "MVrf5pB0sPD9pQjV62NDxJNfBuJj2borv9kv8Ba4NiY="

const parseDeviceIdentifier = (deviceId: string) => {
  const [namePart, networkPart] = deviceId.split("@")
  if (!namePart || !networkPart) {
    throw new Error("Invalid device_id format. Expected '<name>@<networkPrefix>'")
  }

  const trimmedName = namePart.trim()
  const trimmedNetwork = networkPart.trim()
  if (!trimmedName || !trimmedNetwork) {
    throw new Error("device_id is missing required components")
  }

  return {
    name: trimmedName,
    networkPrefix: trimmedNetwork.slice(0, 8),
  }
}

const fetchDeviceRecord = async (deviceId: string): Promise<DeviceRecord> => {
  const { name, networkPrefix } = parseDeviceIdentifier(deviceId)
  if (networkPrefix.length === 0) {
    throw new Error("device_id network component must include at least one character")
  }

  const url = new URL(`${SUPABASE_URL}/rest/v1/devices`)
  url.searchParams.set("select", "id,network_id,name,description,ip_address,private_key,public_key,created_at,updated_at,totp_counter,network:networks(domain_id)")
  url.searchParams.set("name", `eq.${name}`)
  url.searchParams.set("order", "updated_at.desc")
  url.searchParams.set("limit", "25")

  const response = await fetch(url.toString(), {
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to look up device (status ${response.status}): ${errorText}`)
  }

  const devices = await response.json() as Array<Omit<DeviceRecord, "private_key" | "public_key" | "domain_id"> & {
    private_key: string | null
    public_key: string | null
    totp_counter: number
    network: { domain_id: string } | null
  }>

  const device = devices?.find((record) => {
    if (!record.network_id) return false
    const prefix = record.network_id.slice(0, networkPrefix.length)
    return prefix.toLowerCase() === networkPrefix.toLowerCase()
  })

  if (!device) {
    throw new Error("Device not found for provided device_id")
  }

  if (!device.private_key || !device.public_key) {
    throw new Error("Device keys are missing. Ensure the device has private_key and public_key values.")
  }

  if (!device.network?.domain_id) {
    throw new Error("Device network or domain information is missing.")
  }

  return {
    ...device,
    private_key: device.private_key,
    public_key: device.public_key,
    domain_id: device.network.domain_id,
  }
}

const formatDeviceAddress = (ip: string | null | undefined) => {
  const trimmed = ip?.trim()
  if (!trimmed) {
    return "10.121.102.62/32"
  }

  return trimmed.includes("/") ? trimmed : `${trimmed}/32`
}

const generateWireGuardConfig = (
  gateway: string,
  iface: string,
  device_id: string,
  device: DeviceRecord,
) => `# WireGuard VPN Configuration File, device_id: ${device_id}
# Device metadata
# Name: ${device.name}
# Network ID: ${device.network_id}
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

serve(async (req: Request) => {
  const url = new URL(req.url);

  // Parse JSON body
  let gateway = "10.2.0.1"; // default
  let iface = "eth0"; // default
  let device_id = ""; // Will be extracted from query parameter or payload
  let totp_code = ""; // TOTP code used as encryption password
  let deviceRecord: DeviceRecord | null = null

  try {
    // Get device_id from query parameter (required for TOTP generation)
    // URL.searchParams.get() automatically decodes URL-encoded characters
    device_id = url.searchParams.get("device_id") || "";

    if (!device_id || typeof device_id !== "string") {
      return new Response(
        JSON.stringify({ error: "device_id query parameter is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Received device_id: ${device_id}`);

    // Fetch device record to get TOTP counter and domain_id
    try {
      deviceRecord = await fetchDeviceRecord(device_id)
      console.debug(`Device found: ${deviceRecord.id}`);
      console.debug(`  Network ID: ${deviceRecord.network_id}`);
      console.debug(`  Domain ID: ${deviceRecord.domain_id}`);
      console.debug(`  TOTP Counter: ${deviceRecord.totp_counter}`);
    } catch (lookupError) {
      const errorMessage = lookupError instanceof Error ? lookupError.message : String(lookupError)
      console.error(`Device lookup failed for ${device_id}:`, errorMessage);
      return new Response(
        JSON.stringify({ error: "Unable to fetch device keys", details: errorMessage }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Generate valid TOTP codes for this device (current period ±1 window)
    const period = 600;
    const currentTime = Math.floor(Date.now() / 1000);
    const currentCounter = Math.floor(currentTime / period);
    const window = 1;

    console.debug(`Current time: ${currentTime}, Counter: ${currentCounter}`);

    const combinedSecret = `${deviceRecord.domain_id}-${deviceRecord.network_id}-${deviceRecord.id}-${deviceRecord.totp_counter}`;
    console.debug(`Combined secret: ${combinedSecret}`);
    const encoder = new TextEncoder();
    const secret = encoder.encode(combinedSecret);

    // Generate TOTP codes for current and adjacent time windows
    const validTOTPs: string[] = [];
    for (let offset = -window; offset <= window; offset++) {
      const testCounter = currentCounter + offset;
      const code = await generateHOTP(secret, testCounter, 6);
      validTOTPs.push(code);
      console.debug(`  Generated TOTP for counter ${testCounter} (offset ${offset}): ${code}`);
    }

    console.debug(`Generated ${validTOTPs.length} valid TOTP codes for device ${deviceRecord.id}`);
    console.debug(`Valid TOTPs: ${validTOTPs.join(", ")}`);

    // Read body as binary (ArrayBuffer)
    const bodyBuffer = await req.arrayBuffer();

    // Body must be present and non-empty
    if (!bodyBuffer || bodyBuffer.byteLength === 0) {
      return new Response(
        JSON.stringify({ error: "Request body is required and must be encrypted binary data" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const encryptedData = new Uint8Array(bodyBuffer);

    // Check minimum size (Salted__ + salt + at least some ciphertext)
    if (encryptedData.length < 20) {
      return new Response(
        JSON.stringify({ error: "Request body is too small to be valid encrypted data" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Try to decrypt with each valid TOTP code
    let decryptedText: string | null = null;
    let usedTOTP = "";

    console.debug(`\nAttempting to decrypt payload with ${validTOTPs.length} TOTP codes...`);
    console.debug(`Encrypted payload size: ${encryptedData.length} bytes`);
    console.debug(`First 16 bytes (hex): ${Array.from(encryptedData.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    
    for (let i = 0; i < validTOTPs.length; i++) {
      const totp = validTOTPs[i];
      try {
        console.debug(`  Attempt ${i + 1}/${validTOTPs.length}: Trying TOTP ${totp}...`);
        decryptedText = await decryptPayload(encryptedData, totp);
        usedTOTP = totp;
        totp_code = totp; // Store the TOTP that worked
        console.debug(`  ✓ SUCCESS! Decrypted with TOTP: ${totp}`);
        break;
      } catch (decryptError) {
        const errorMsg = decryptError instanceof Error ? decryptError.message : String(decryptError);
        console.debug(`  ✗ Failed with TOTP ${totp}: ${errorMsg}`);
        // Try next TOTP
        continue;
      }
    }

    if (!decryptedText) {
      console.error(`All decryption attempts failed. Tested TOTPs: ${validTOTPs.join(", ")}`);
      return new Response(
        JSON.stringify({
          error: "Failed to decrypt payload with any valid TOTP code",
          tested_totps: validTOTPs,
          device_info: {
            id: deviceRecord.id,
            network_id: deviceRecord.network_id,
            domain_id: deviceRecord.domain_id,
            totp_counter: deviceRecord.totp_counter
          }
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Attempt to parse JSON - this will throw if parsing fails
    let jsonData;
    try {
      jsonData = JSON.parse(decryptedText);
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      return new Response(
        JSON.stringify({ error: "Decrypted payload is not valid JSON", details: errorMessage }), 
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Extract parameters from decrypted payload
    gateway = jsonData.gateway || gateway;
    iface = jsonData.interface || iface;

    // Verify device_id in payload matches query parameter
    const payloadDeviceId = jsonData.device_id || "";
    if (payloadDeviceId && payloadDeviceId !== device_id) {
      console.log(`Device ID mismatch: query=${device_id}, payload=${payloadDeviceId}`);
      return new Response(
        JSON.stringify({ error: "Device ID in payload does not match query parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`TOTP validation successful for device: ${deviceRecord.id}`);
    console.debug(`Used TOTP code: ${usedTOTP}`);

  } catch (error) {
    // Catch any unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: "Failed to process request", details: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!deviceRecord) {
    return new Response(
      JSON.stringify({ error: "Device lookup did not complete" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const WIREGUARD_CONFIG = generateWireGuardConfig(gateway, iface, device_id, deviceRecord);

  // Encrypt the response using the same TOTP code (returns binary data)
  const encryptedConfig = await encryptPayload(WIREGUARD_CONFIG, totp_code);
  
  // Support both download and inline display
  const download = url.searchParams.get('download') === 'true';
  
  const headers = new Headers({
    "Content-Type": "application/octet-stream",
    "Content-Disposition": download 
      ? 'attachment; filename="wg0.conf.enc"' 
      : 'inline',
    "Content-Length": encryptedConfig.byteLength.toString(),
  });

  return new Response(encryptedConfig as unknown as BodyInit, { headers });
});

// IMPORTANT: This function uses TOTP-based encryption
// The TOTP code is used as the AES-256-CBC encryption password
//
// AUTHENTICATION FLOW:
// 1. Client provides device_id as query parameter
// 2. Server generates valid TOTP codes for that device
// 3. Server tries to decrypt payload with each valid TOTP
// 4. If decryption succeeds, TOTP is validated
// 5. Response is encrypted with the same TOTP code
//
// QUERY PARAMETERS (Required):
// - device_id: string (format: "<name>@<networkPrefix>")
//
// PAYLOAD FIELDS (Encrypted with TOTP as password):
// - device_id: string (must match query parameter)
// - gateway: string (optional, default: "10.2.0.1")
// - interface: string (optional, default: "eth0")
//
// EXAMPLE USAGE:
// # Generate TOTP code (from UI or device)
// TOTP="123456"
// DEVICE_ID="iotgw-m3v6@da9148f6"
//
// # Encrypt payload with TOTP as password
// echo '{"gateway":"10.2.0.1","interface":"eth0","device_id":"iotgw-m3v6@da9148f6"}' | \
//   openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:${TOTP} > /tmp/request.enc
//
// # Send request with device_id as query parameter
// curl "http://localhost:54321/functions/v1/vpn?device_id=${DEVICE_ID}" \
//   --header 'Authorization: Bearer <anon_key>' \
//   --header 'Content-Type: application/octet-stream' \
//   --data-binary @/tmp/request.enc \
//   -o /tmp/response.enc
//
// # Decrypt response with same TOTP
// openssl enc -d -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:${TOTP} \
//   -in /tmp/response.enc > wg0.conf
//
// ERROR RESPONSES:
// - 400 Missing device_id: {"error": "device_id query parameter is required"}
// - 400 Device not found: {"error": "Unable to fetch device keys", "details": "..."}
// - 400 Missing body: {"error": "Request body is required and must be encrypted binary data"}
// - 400 Body too small: {"error": "Request body is too small to be valid encrypted data"}
// - 401 Invalid TOTP: {"error": "Failed to decrypt payload with any valid TOTP code"}
// - 400 Invalid JSON: {"error": "Decrypted payload is not valid JSON", "details": "..."}
// - 400 Device mismatch: {"error": "Device ID in payload does not match query parameter"}
