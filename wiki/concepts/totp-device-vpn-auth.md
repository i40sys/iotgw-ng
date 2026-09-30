---
title: TOTP Device VPN Authentication
category: concepts
tags: [secrets/totp, vpn/wireguard, data/edge-functions, status/current]
relationships:
  - target: "[[entities/edge-functions]]"
    type: uses
sources:
  - backlog/decisions/decision-009 - TOTP-Authentication-for-Device-VPN-Access.md
summary: Devices retrieve their WireGuard config from the vpn/ edge function using a counter-based TOTP — stateless, time-limited, encrypted transport, no long-term device credentials.
provenance:
  extracted: 0.88
  inferred: 0.07
  ambiguous: 0.05
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# TOTP Device VPN Authentication

Devices authenticate to retrieve their VPN configuration **without storing
long-term credentials**, using a **counter-based TOTP** (Time-based One-Time
Password) validated by the stateless `vpn/` edge function.

## Mechanism

- **Secret composition** (identical on frontend and edge function):
  `${domain_id}-${network_id}-${device_id}-${totp_counter}`.
- **TOTP params:** HMAC-SHA1, 6 digits, **600 s (10-minute) period**, ±1 window
  → up to ~30 minutes of validity to absorb clock drift.
- **Counter** (`devices.totp_counter`, default 0) is incremented on demand
  (timer-expiry auto-refresh or manual reset) via the backend
  `incrementTotpCounter` procedure — each reset creates a new TOTP sequence,
  preventing replay.

## Flow

1. Frontend (`device-totp-dialog.tsx`) generates and displays a 6-digit code with
   a countdown; auto-regenerates on expiry.
2. Device encrypts its request payload (AES-256-CBC, PBKDF2 300k iterations,
   OpenSSL-compatible `Salted__` format) using the **TOTP code as the password**.
3. `vpn/` edge function fetches the device record, regenerates the same secret,
   computes the 3 valid TOTPs (current ±1), and tries to decrypt with each.
   Successful decryption = authentication.
4. The WireGuard config is encrypted with the same TOTP and returned as binary.

## Why this shape

- **Stateless** validation (no session state — fits edge functions).
- **Time-limited** (10-min validity); no long-term device secrets.
- Counter-based **manual regeneration** allows a 10-minute period (vs standard
  TOTP's 30 s, too short for manual entry) plus immediate force-refresh.
- Alternatives rejected: static API keys, JWTs, device certificates (all require
  device-side credential storage or heavier management).

## Sources

- decision-009 (TOTP Authentication for Device VPN Access). RFC 4226 (HOTP),
  RFC 6238 (TOTP).
- Code: `apps/app/src/components/device-totp-dialog.tsx`,
  `apps/backend/src/routers/devices.ts`, `supabase/volumes/functions/vpn/index.ts`.
- Related: [[entities/edge-functions]], [[references/openwrt-wireguard-config]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/decisions/decision-009 - TOTP-Authentication-for-Device-VPN-Access|decision-009 - TOTP-Authentication-for-Device-VPN-Access]]
