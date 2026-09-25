---
id: TASK-132.04
title: >-
  Edge functions: backend-issued candidates, single-use + lockout, sealed VPN
  reply, ssh-ca renew
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
updated_date: '2026-09-25 18:27'
labels:
  - edge-functions
  - security
  - vpn
  - ssh-ca
dependencies: []
parent_task_id: TASK-132
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-033 §3-§5. _shared/device-auth.ts gets candidates from the backend, consumes per purpose, records failures; vpn seals the reply to reply_key (X25519-HKDF-SHA256-A256GCM) with legacy fallback; ssh-ca: enroll only when not enrolled, new host-key-signed renew action, live-enroll/trust purposes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A reused code is refused (401) and the 6th wrong code locks the device
- [x] #2 vpn reply with reply_key is sealed and decryptable only with the X25519 private key
- [x] #3 renew accepts a fresh SSHSIG by the enrolled key without a code and refuses stale/replayed timestamps
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.** device-auth: backend candidates, lockout 429, failure recording, consume per purpose; vpn sealed reply (X25519-HKDF-SHA256-A256GCM) + legacy fallback; ssh-ca: enroll 409 when enrolled, host-key `renew`.
- Fix during integration: the seal AAD used the device UUID; now the wire `device_id` (contract).
- Deno tests 16/16. Live on kind: sealed reply opened by an independent Python client; replay 401; wrong code 401 + failure counted; enroll on enrolled device 409.
<!-- SECTION:NOTES:END -->
