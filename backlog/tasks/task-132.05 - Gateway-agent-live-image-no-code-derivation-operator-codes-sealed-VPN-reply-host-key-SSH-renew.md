---
id: TASK-132.05
title: >-
  Gateway agent + live image: no code derivation; operator codes; sealed VPN
  reply; host-key SSH renew
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
labels:
  - live-image
  - openwrt
  - security
dependencies: []
parent_task_id: TASK-132
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-033 §2/§4/§5/§6. Delete internal/totp; vpn refresh requires -otp and sends reply_key; bootstrap vpnFetch too; ssh refresh renews with the host key and needs -otp only for first enrollment; daemon self-renews (no self-enroll); console [v]/[s] prompt for the code; LuCI code required for VPN; fakeapi + QEMU e2e updated.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No code on the gateway can compute a TOTP
- [ ] #2 just check and the QEMU e2e pass
- [ ] #3 Released and pinned in the install flow
<!-- AC:END -->
