---
id: TASK-132.04
title: >-
  Edge functions: backend-issued candidates, single-use + lockout, sealed VPN
  reply, ssh-ca renew
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
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
- [ ] #1 A reused code is refused (401) and the 6th wrong code locks the device
- [ ] #2 vpn reply with reply_key is sealed and decryptable only with the X25519 private key
- [ ] #3 renew accepts a fresh SSHSIG by the enrolled key without a code and refuses stale/replayed timestamps
<!-- AC:END -->
