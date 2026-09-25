---
id: decision-033
title: >-
  033: Device one-time codes from a KMS-held random seed — operator-entered,
  single-use; sealed VPN replies; host-key SSH renewal
date: '2026-09-25 18:00'
status: accepted
---
## Context

decision-009 authenticates a device to the `vpn` and `ssh-ca` edge functions
with a 6-digit TOTP (HOTP/HMAC-SHA1, 600 s step, ±1) keyed by the **literal
string** `<domain_id>-<network_id>-<device_uuid>-<totp_counter>`. Those are
identifiers, not secrets: they are in `/etc/config/iotgw` on the gateway, in the
UI (which computes the code **in the browser**), in the DB and in Kestra
(`tasks/ssh_ca.yaml` derives the code on the controller). Anyone who knows them
can mint a valid code, ask `vpn` for the device's WireGuard config and receive
its **private key**. The installed agent (decision-032) derives the code itself
for `vpn refresh`, `ssh refresh` and its first-enrollment loop.

Two more weaknesses sit next to it:

- the request **and the reply** are encrypted with the 6-digit code
  (`openssl enc -aes-256-cbc -pbkdf2 -iter 300000`). 10⁶ codes × 300 k PBKDF2
  rounds is minutes on one GPU, so a recorded exchange over the plain-HTTP
  device API yields the private key even when the code itself is unknown;
- a code is valid for its whole window (≈20 min) and can be replayed; nothing
  limits guessing.

## Decision

### 1. A random per-device seed, held by the KMS, read only by the backend

- Each device gets a **256-bit random seed**: a Cosmian KMS symmetric key,
  UID `device_totp_<device_uuid>_<n>` (n = rotation number), tags
  `device-totp`, `device-<uuid>`. The UID is stored in `devices.totp_seed_id`.
- The **backend** creates it when the device is created (next to its SSH key,
  decision-010) and lazily for devices that predate this decision. It is the
  **only** component that reads the seed (KMIP `Get`, raw) and it computes codes
  in memory; nothing persists or returns the seed.
- Code = RFC 6238 TOTP: HMAC-SHA1, 6 digits, **600 s step** (the PXE path —
  code typed at the iPXE prompt, then kernel + squashfs download — needs the long
  step), ±1 step accepted.
- "Reset code" in the UI **rotates** the seed (new UID, old key destroyed); it
  replaces the `totp_counter` bump. `totp_counter` is no longer read anywhere.

### 2. Who sees a code

| Component | Gets | How |
|---|---|---|
| Operator (UI) | the current code | tRPC `getDeviceCode` (authenticated, logged). The browser no longer computes codes |
| Edge functions `vpn`, `ssh-ca` | the **codes** valid now (never the seed) | backend `POST /internal/device-auth/candidates`, bearer `DEVICE_AUTH_TOKEN` |
| Kestra provisioning (first SSH enrollment) | one current code | backend `POST /internal/devices/enroll-code`, bearer `OPS_CERT_MINT_TOKEN` (the existing Kestra→backend credential) |
| Gateway | only the code the **operator types** | `iotgw vpn refresh -otp`, console `[v]`, LuCI, live image `otp=` |

The gateway never has the seed and **cannot compute a code**; it neither
validates codes nor needs to. Its `internal/totp` derivation is deleted.

### 3. Single use, replay protection and rate limiting (server side)

- `device_otp_uses(device_id, seed_id, purpose, step, used_at)`, primary key
  `(device_id, seed_id, purpose, step)`. Purposes: `vpn`, `ssh-enroll`,
  `ssh-live-enroll`, `ssh-trust`.
- SECURITY DEFINER RPC `consume_device_otp(device, seed_id, purpose, step)`,
  serialized per device+purpose with an advisory lock: accepts only if **no use
  with a step ≥ this step** exists for that purpose — a code is used **once**,
  and an older still-in-window code is dead once a newer one was used. The code
  is consumed **before** the reply is sent (fail closed).
- A code is single-use **per purpose**: the live image's boot presents the code
  once to `vpn` and once to `ssh-ca live-enroll`; each is consumed.
- `record_device_otp_failure(device)`: 5 failed attempts lock the device's code
  endpoints for 15 min (`devices.totp_locked_until`). Checked before any
  decryption attempt.
- If a code was consumed but the reply was lost, `getDeviceCode` offers the
  **next step's** code at once (accepted by the +1 window); "Reset code"
  rotates the seed if even that is spent.

### 4. The VPN reply is sealed to the requester, not to the code

- The request (still the code envelope — it authenticates) carries
  `reply_key`: a fresh **X25519** public key the gateway generated for this call.
- The reply is JSON
  `{"v":1,"alg":"X25519-HKDF-SHA256-A256GCM","epk","nonce","ct"}`:
  `shared = X25519(eph, reply_key)`,
  `key = HKDF-SHA256(ikm=shared, salt=epk‖reply_key, info="iotgw-vpn-reply v1")`,
  AES-256-GCM, AAD = `device_id`. Brute-forcing the code from a recording yields
  only the request, never the private key.
- A request **without** `reply_key` still gets the legacy code-encrypted reply,
  logged as deprecated, until every live image in use has been redeployed
  (follow-up task).

### 5. SSH enrollment stays a separate API, with a different second step

- **First enrollment** (`ssh-ca enroll`, device has no recorded host key): code
  envelope, purpose `ssh-enroll`. The code comes from the operator (`iotgw ssh
  refresh -otp`, console `[s]`, LuCI) or from Kestra provisioning (backend
  `enroll-code`). `enroll` on an **already enrolled** device is refused (409) —
  after a reinstall the operator uses **Reset SSH enrollment** first, as today.
- **Renewal / host-key rotation** (`ssh-ca renew`): **no code**. Plain JSON
  `{device_id, action:"renew", host_pubkey, ts, sig}`, where `sig` is an SSHSIG
  (namespace `iotgw-renew`) over `<device_id>\n<host_pubkey>\n<ts>` by the
  **currently enrolled** host key. `|now − ts| ≤ 300 s` and `ts` must exceed the
  last accepted one (`consume_device_renew`). The reply is public material only
  (certificate, CA keys, sshd drop-in), so it is not encrypted.
- The daemon no longer self-enrolls (it cannot derive a code); it **renews by
  itself** with the host key when the certificate nears expiry — safe, since it
  proves possession of the enrolled key.
- `live-enroll` (live image) keeps the code envelope, purpose `ssh-live-enroll`.

### 6. The daemon never refreshes the VPN automatically

Unchanged from decision-032 and now enforced by construction: without an
operator code there is no way to call `vpn`.

## Consequences

- **Supersedes decision-009** (secret composition, browser-side generation,
  counter reset) and task-126 (host-key proof for unattended VPN refresh —
  rejected: VPN refresh stays operator-driven).
- decision-032 "Refresh authentication" changes: no derived codes; `vpn refresh`
  needs `-otp`; SSH renewal by host key.
- Agents ≤ v0.2.2 can no longer refresh the VPN or enroll (they derive codes);
  gateways must get the new agent release. Live images already deployed keep
  working (the operator types the code; the reply falls back to the legacy
  envelope).
- New secret `DEVICE_AUTH_TOKEN` (backend + functions), SOPS-managed
  (decision-014).
- **Precondition not met yet — TASK-136:** the iotgw-ui backend has no operator
  authentication, so on the current deployment anyone who can reach it can call
  getDeviceCode. The design assumes a trusted, authenticated UI; until TASK-136 lands,
  a code is only as protected as network access to the backend.
- **Not solved here — follow-up tasks:** TLS on the device API; the gateway
  generating its own WireGuard key pair so no private key is ever transmitted or
  stored (`devices.private_key`); removing the legacy unsealed VPN reply;
  dropping `devices.totp_counter`.
