---
id: TASK-132
title: 'Epic: device one-time codes from a KMS-held random seed (decision-033)'
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
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
- [ ] #1 All subtasks Done
- [ ] #2 A gateway cannot compute a valid code (no seed, no derivation code on it)
- [ ] #3 Verified end-to-end on kind + gw-c3: operator code → vpn refresh; code reuse refused; ssh renew without a code
<!-- AC:END -->
