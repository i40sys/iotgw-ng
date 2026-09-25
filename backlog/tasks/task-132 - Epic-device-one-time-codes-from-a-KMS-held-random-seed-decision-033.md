---
id: TASK-132
title: 'Epic: device one-time codes from a KMS-held random seed (decision-033)'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
updated_date: '2026-09-25 18:27'
labels:
  - security
  - vpn
  - ssh-ca
  - kms
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Implements decision-033.** Replace decision-009's identifier-derived TOTP with a random per-device seed in Cosmian KMS that only the backend reads; codes are operator-entered and single-use; the VPN reply is sealed to a gateway-generated X25519 key; SSH renewal is host-key signed. Subtasks cover each component.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All subtasks Done
- [x] #2 A gateway cannot compute a valid code (no seed, no derivation code on it)
- [x] #3 Verified end-to-end on kind + gw-c3: operator code → vpn refresh; code reuse refused; ssh renew without a code
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done (2026-09-25).** decision-033 implemented across DB, backend, UI, edge functions, gateway agent (v0.3.0), Kestra/Ansible, deploy and docs.

**Verified end-to-end (kind + gw-c3):**
- operator code → VPN refresh with a sealed reply, applied, tunnel UP; replay → 401; no code → refused;
- SSH: renewal with no code (host key); first enrollment through provisioning with a backend-issued code;
- the gateway has no seed and no derivation code (internal/totp deleted); the UI bundle no longer computes codes.

**Open follow-ups:** TASK-136 operator authentication (precondition of the trusted-UI assumption — the backend is unauthenticated today), TASK-133 TLS, TASK-134 gateway-generated WireGuard keys, TASK-135 legacy reply + totp_counter removal, TASK-137 log hint.
<!-- SECTION:NOTES:END -->
