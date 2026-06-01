---
id: decision-009
title: TOTP Authentication for Device VPN Access
date: '2025-11-18 07:43'
status: accepted
---
## Context

IoT devices need secure access to VPN configurations without traditional username/password authentication. The challenge is to provide time-limited, device-specific credentials that can be validated by an edge function while maintaining security and ease of use.

**Requirements:**
- Devices must authenticate without storing long-term credentials
- Authentication must be time-limited to reduce exposure window
- Solution must work with Supabase Edge Functions
- Must support clock drift between client and server
- Must allow credential refresh without manual intervention

**Constraints:**
- Edge functions are stateless and cannot maintain session state
- Devices may have slightly inaccurate system clocks
- Authentication must be fast and efficient
- Must work with encrypted payloads

## Decision

We implement a **TOTP (Time-based One-Time Password)** authentication system with a counter-based secret generation mechanism. This provides time-limited authentication while maintaining stateless edge function operation.

### Architecture Overview

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Frontend  │◄────►│   Database   │◄────►│ Edge Func   │
│  (React UI) │      │  (Supabase)  │      │    (VPN)    │
└─────────────┘      └──────────────┘      └─────────────┘
      │                     │                      │
      │  1. Show TOTP       │                      │
      │  2. Auto-refresh    │ 3. Validate TOTP     │
      │                     │    using counter     │
      └─────────────────────┴──────────────────────┘
```

### Key Components

#### 1. Database Schema

**Table: `devices`**
- Field: `totp_counter` (integer, default: 0)
- Incremented each time a new TOTP period is needed
- Shared between frontend and edge function for secret generation

#### 2. TOTP Generation (Frontend)

**Location:** `apps/app/src/components/device-totp-dialog.tsx`

**Secret Composition:**
```typescript
const combinedSecret = `${domainId}-${networkId}-${deviceId}-${currentCounter}`;
```

**Parameters:**
- Algorithm: HMAC-SHA1
- Digits: 6
- Period: 600 seconds (10 minutes)
- Window: ±1 period (allows 20 minutes total validity)

**Key Features:**
- Displays TOTP code with countdown timer
- Auto-regenerates when countdown reaches 0
- Manual reset button to increment counter immediately
- Copy-to-clipboard functionality

**Auto-Regeneration Logic:**
```typescript
useEffect(() => {
  if (timeRemaining === 0 && open && !incrementCounterMutation.isPending) {
    incrementCounterMutation.mutate({ id: deviceId });
  }
}, [timeRemaining, open, incrementCounterMutation.isPending, deviceId]);
```

#### 3. Counter Management (Backend)

**Location:** `apps/backend/src/routers/devices.ts:394`

**Procedure:** `incrementTotpCounter`

**Process:**
1. Fetch current counter value from database
2. Increment counter: `newCounter = currentCounter + 1`
3. Update device record with new counter
4. Return updated device with network and domain info

**Result:**
- New counter triggers different TOTP sequence
- Frontend receives updated counter and regenerates code
- Timer resets to 10 minutes

#### 4. TOTP Validation (Edge Function)

**Location:** `/supabase/volumes/functions/vpn/index.ts`

**Authentication Flow:**

1. **Device Lookup** (line 260-318):
   ```typescript
   const device = await fetchDeviceRecord(deviceId);
   // Returns: id, network_id, domain_id, totp_counter, keys
   ```

2. **Secret Generation** (line 408):
   ```typescript
   const combinedSecret = `${domain_id}-${network_id}-${device_id}-${totp_counter}`;
   ```

3. **Generate Valid TOTPs** (lines 414-423):
   - Calculate current time-based counter
   - Generate TOTP for current period
   - Generate TOTP for ±1 periods (handles clock drift)
   - Results in 3 valid codes at any given time

4. **Payload Decryption** (lines 446-483):
   - Client sends AES-256-CBC encrypted payload
   - TOTP code is used as encryption password
   - Edge function tries each valid TOTP to decrypt
   - Successful decryption = authentication success

5. **Response Encryption** (line 533):
   - WireGuard config is encrypted with same TOTP
   - Returns encrypted binary data to client

**Security Properties:**
- Stateless validation (no session storage needed)
- Time-limited validity (20 minutes max with clock drift)
- Counter-based uniqueness (each reset creates new sequence)
- Encrypted transport (both request and response)

### Implementation Details

#### Secret Generation Algorithm

Both frontend and edge function use identical logic:

```typescript
// 1. Create combined secret string
const secret = `${domain_id}-${network_id}-${device_id}-${totp_counter}`;

// 2. Convert to bytes
const encoder = new TextEncoder();
const secretBytes = encoder.encode(secret);

// 3. Generate HOTP using HMAC-SHA1
const counter = Math.floor(Date.now() / 1000 / period); // period = 600
const otp = await generateHOTP(secretBytes, counter, 6);
```

#### Clock Drift Handling

The edge function validates TOTPs across a time window:

```typescript
const currentCounter = Math.floor(Date.now() / 1000 / 600);
const window = 1; // ±1 period

for (let offset = -window; offset <= window; offset++) {
  const testCounter = currentCounter + offset;
  const testOTP = await generateHOTP(secret, testCounter, 6);
  // Try to decrypt with this OTP
}
```

This means:
- **Current period:** Valid for next 10 minutes
- **Previous period:** Valid for up to 10 minutes ago
- **Next period:** Valid for up to 10 minutes in future
- **Total window:** 30 minutes of possible validity

#### Encryption Format

**Algorithm:** AES-256-CBC with PBKDF2 key derivation

**Format (OpenSSL compatible):**
```
[8 bytes: "Salted__"][8 bytes: salt][remaining: ciphertext]
```

**Parameters:**
- Key derivation: PBKDF2 with 300,000 iterations
- Hash: SHA-256
- Key size: 256 bits
- IV size: 128 bits
- Password: TOTP code (6 digits)

**Usage Example:**
```bash
# Encrypt with TOTP
echo '{"device_id":"iotgw@da9148f6"}' | \
  openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:123456

# Decrypt with same TOTP
openssl enc -d -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass pass:123456
```

### Data Flow Diagram

```
User opens TOTP dialog
         │
         ▼
Frontend generates TOTP using:
  domain_id + network_id + device_id + totp_counter
         │
         ▼
Display 6-digit code + countdown (10 min)
         │
         ├─────► Manual Reset ─────┐
         │                          │
         ▼                          ▼
Timer reaches 0 ──► Increment totp_counter in DB
         │                          │
         ▼                          │
New counter value returned ◄────────┘
         │
         ▼
Frontend regenerates TOTP with new counter
         │
         ▼
Timer resets to 10 minutes

═══════════════════════════════════════════

Device requests VPN config
         │
         ▼
Encrypts payload with TOTP as password
         │
         ▼
Sends to edge function: /vpn?device_id=...
         │
         ▼
Edge function:
  1. Fetches device record (gets totp_counter)
  2. Generates same secret string
  3. Creates 3 valid TOTPs (current ±1)
  4. Tries to decrypt payload with each
         │
         ├──► Success: Return encrypted config
         │
         └──► Failure: Return 401 error
```

## Consequences

### Positive

✅ **Security:**
- Time-limited credentials (10-minute validity)
- No long-term secrets stored on devices
- Encrypted transport for both request and response
- Counter-based uniqueness prevents replay attacks
- Stateless validation (no session hijacking risk)

✅ **User Experience:**
- Simple 6-digit code display
- Auto-refresh on expiry
- Manual reset available
- Copy-to-clipboard functionality
- Clear countdown timer

✅ **Operational:**
- Stateless edge function (horizontally scalable)
- Clock drift tolerance (±10 minutes)
- No external dependencies (no SMS, email, etc.)
- Database-backed counter synchronization

✅ **Development:**
- Reusable OTPAuth library (frontend)
- Standard HMAC-SHA1 implementation
- OpenSSL-compatible encryption format
- Clear separation of concerns

### Negative

⚠️ **Considerations:**

1. **Clock Dependency:**
   - Requires reasonably accurate system clocks
   - Mitigation: ±10 minute window handles most drift

2. **Counter Management:**
   - Database must be available for counter updates
   - Mitigation: Read-only operations can still work with existing counter

3. **6-Digit Security:**
   - Relatively short code (1 million possibilities)
   - Mitigation: Time-limited validity and encryption reduce attack surface

4. **Manual Process:**
   - Devices must manually copy TOTP from UI
   - Future: Could implement QR code or API endpoint for automation

### Alternatives Considered

1. **Static API Keys:**
   - ❌ Long-term credentials increase exposure risk
   - ❌ Difficult to rotate without device reconfiguration

2. **JWT Tokens:**
   - ❌ Requires token storage on device
   - ❌ More complex implementation
   - ❌ Still needs initial authentication mechanism

3. **Device Certificates:**
   - ❌ Complex certificate management
   - ❌ Difficult to revoke and rotate
   - ❌ Higher implementation overhead

4. **Standard TOTP (without counter):**
   - ❌ Cannot force immediate regeneration
   - ❌ 30-second periods too short for manual entry
   - ✅ Our counter-based approach allows 10-minute periods with manual reset

### Future Enhancements

1. **Automated Device Authentication:**
   - Implement device-side TOTP generation
   - Eliminate manual copy-paste step

2. **QR Code Display:**
   - Generate QR code with TOTP parameters
   - Allow device camera-based authentication

3. **Audit Logging:**
   - Track TOTP usage and validation attempts
   - Alert on suspicious patterns

4. **Extended Window Configuration:**
   - Make time window configurable per device
   - Support different security levels

5. **Push Notifications:**
   - Alert users when TOTP is requested
   - Provide approval/denial mechanism

## References

**Standards:**
- RFC 4226: HOTP (HMAC-Based One-Time Password)
- RFC 6238: TOTP (Time-Based One-Time Password)

**Implementation Files:**
- Frontend: `apps/app/src/components/device-totp-dialog.tsx`
- Backend: `apps/backend/src/routers/devices.ts`
- Edge Function: `supabase/volumes/functions/vpn/index.ts`
- Database: `devices.totp_counter` field

**Dependencies:**
- Frontend: `otpauth` npm package
- Edge Function: Deno standard crypto API
- Encryption: OpenSSL-compatible AES-256-CBC

**Testing:**
- Manual test guide: `apps/app/src/test/vpn-totp-manual-test.md`
- Integration test: `apps/app/src/test/totp-integration.test.ts`
