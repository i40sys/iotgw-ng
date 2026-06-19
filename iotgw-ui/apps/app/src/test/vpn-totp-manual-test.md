# VPN Edge Function TOTP Manual Test Guide

This guide provides step-by-step instructions for manually testing the TOTP-protected VPN edge function.

## Prerequisites

- Supabase local development environment running
- A device exists in the database with valid keys
- Docker and OpenSSL installed

## Test Setup

### 1. Get Test Device Information

Query the database to get a device with valid keys:

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "
  SELECT
    d.id,
    d.name,
    d.network_id,
    n.domain_id,
    d.totp_counter
  FROM devices d
  JOIN networks n ON d.network_id = n.id
  LIMIT 1;
"
```

Save the values:
- `device_id`: The device UUID
- `name`: Device name
- `network_id`: Network UUID (first 8 chars for device_id format)
- `domain_id`: Domain UUID
- `totp_counter`: Current counter value

### 2. Generate TOTP Code

You can generate a valid TOTP code in two ways:

#### Option A: Using the UI
1. Navigate to http://wsl.ymbihq.local:5173/devices
2. Click the key icon (TOTP button) for your test device
3. Copy the 6-digit code displayed

#### Option B: Using Node.js Script
Create a file `generate-totp.js`:

```javascript
import { TOTP, Secret } from 'otpauth';

const deviceId = 'YOUR_DEVICE_ID';
const networkId = 'YOUR_NETWORK_ID';
const domainId = 'YOUR_DOMAIN_ID';
const totpCounter = 0; // Use actual counter from database

const combinedSecret = `${domainId}-${networkId}-${deviceId}-${totpCounter}`;
const encoder = new TextEncoder();
const data = encoder.encode(combinedSecret);
const secret = new Secret({ buffer: data });

const totp = new TOTP({
  issuer: 'IoTGW',
  algorithm: 'SHA1',
  digits: 6,
  period: 600,
  secret: secret,
});

const code = totp.generate();
console.log('TOTP Code:', code);
```

Run: `node generate-totp.js`

## Test Scenarios

### Test 1: Valid TOTP Code (Success)

```bash
# Replace these values with your actual data:
DEVICE_NAME="your-device-name"
NETWORK_PREFIX="first-8-chars-of-network-id"
DEVICE_ID="${DEVICE_NAME}@${NETWORK_PREFIX}"
TOTP_CODE="123456"  # Use actual generated code

# Create encrypted request payload
echo "{
  \"gateway\": \"10.2.0.1\",
  \"interface\": \"eth0\",
  \"device_id\": \"${DEVICE_ID}\",
  \"totp_code\": \"${TOTP_CODE}\"
}" | openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:"$VPN_TEST_PASS" > /tmp/vpn-request.enc

# Send request to VPN edge function
curl 'http://localhost:54321/functions/v1/vpn' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --data-binary @/tmp/vpn-request.enc \
  --output /tmp/vpn-response.enc

# Decrypt response
openssl enc -d -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:"$VPN_TEST_PASS" \
  -in /tmp/vpn-response.enc

# Expected: WireGuard configuration file
```

### Test 2: Invalid TOTP Code (Failure - 401)

```bash
# Use an invalid TOTP code
INVALID_TOTP="000000"

echo "{
  \"gateway\": \"10.2.0.1\",
  \"interface\": \"eth0\",
  \"device_id\": \"${DEVICE_ID}\",
  \"totp_code\": \"${INVALID_TOTP}\"
}" | openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:"$VPN_TEST_PASS" \
  | curl 'http://localhost:54321/functions/v1/vpn' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --data-binary @-

# Expected: {"error": "Invalid or expired TOTP code"}
```

### Test 3: Missing TOTP Code (Failure - 400)

```bash
echo "{
  \"gateway\": \"10.2.0.1\",
  \"interface\": \"eth0\",
  \"device_id\": \"${DEVICE_ID}\"
}" | openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:"$VPN_TEST_PASS" \
  | curl 'http://localhost:54321/functions/v1/vpn' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --data-binary @-

# Expected: {"error": "totp_code is required in the request payload"}
```

### Test 4: Expired TOTP Code (Failure - 401)

```bash
# Wait 10+ minutes after generating a TOTP code, then use it
# The code should be rejected as expired

echo "{
  \"gateway\": \"10.2.0.1\",
  \"interface\": \"eth0\",
  \"device_id\": \"${DEVICE_ID}\",
  \"totp_code\": \"${EXPIRED_CODE}\"
}" | openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:"$VPN_TEST_PASS" \
  | curl 'http://localhost:54321/functions/v1/vpn' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --data-binary @-

# Expected: {"error": "Invalid or expired TOTP code"}
```

### Test 5: TOTP Reset Flow

1. Generate TOTP code with counter = 0
2. Increment counter via UI (click Reset button)
3. Try using old TOTP code → Should fail
4. Generate new TOTP code with counter = 1
5. Use new code → Should succeed

```bash
# After incrementing counter in UI
NEW_TOTP_CODE="654321"  # Generate with new counter

echo "{
  \"gateway\": \"10.2.0.1\",
  \"interface\": \"eth0\",
  \"device_id\": \"${DEVICE_ID}\",
  \"totp_code\": \"${NEW_TOTP_CODE}\"
}" | openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:"$VPN_TEST_PASS" \
  | curl 'http://localhost:54321/functions/v1/vpn' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --data-binary @- \
  | openssl enc -d -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:"$VPN_TEST_PASS"

# Expected: WireGuard configuration
```

### Test 6: Wrong Counter Value

```bash
# Generate code with counter = 0, but device has counter = 1 in database
WRONG_COUNTER_CODE="123456"

echo "{
  \"gateway\": \"10.2.0.1\",
  \"interface\": \"eth0\",
  \"device_id\": \"${DEVICE_ID}\",
  \"totp_code\": \"${WRONG_COUNTER_CODE}\"
}" | openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:"$VPN_TEST_PASS" \
  | curl 'http://localhost:54321/functions/v1/vpn' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --data-binary @-

# Expected: {"error": "Invalid or expired TOTP code"}
```

## Validation Checklist

- [ ] Test 1: Valid TOTP returns WireGuard config
- [ ] Test 2: Invalid TOTP returns 401 error
- [ ] Test 3: Missing TOTP returns 400 error
- [ ] Test 4: Expired TOTP returns 401 error
- [ ] Test 5: Reset increments counter and old codes fail
- [ ] Test 6: Wrong counter value fails validation
- [ ] UI displays TOTP correctly with countdown timer
- [ ] UI reset button increments counter in database
- [ ] Frontend and backend generate matching codes

## Debugging

### Check Edge Function Logs

```bash
docker logs supabase-edge-runtime -f
```

### Check Device Counter

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "
  SELECT id, name, totp_counter
  FROM devices
  WHERE id = 'YOUR_DEVICE_ID';
"
```

### Manually Increment Counter

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "
  UPDATE devices
  SET totp_counter = totp_counter + 1
  WHERE id = 'YOUR_DEVICE_ID';
"
```

## Expected Behavior Summary

| Scenario | Expected Result | Status Code |
|----------|----------------|-------------|
| Valid TOTP code | WireGuard config returned | 200 |
| Invalid TOTP code | Error: Invalid or expired | 401 |
| Missing TOTP code | Error: totp_code required | 400 |
| Expired TOTP (>10 min) | Error: Invalid or expired | 401 |
| Wrong counter value | Error: Invalid or expired | 401 |
| Missing device_id | Error: device_id required | 400 |

## Notes

- TOTP codes are valid for 10 minutes (600 seconds)
- Counter increments each time Reset button is clicked
- Frontend and backend must use identical secret generation
- Window parameter allows ±1 period tolerance for clock drift
