---
id: TASK-132.05
title: >-
  Gateway agent + live image: no code derivation; operator codes; sealed VPN
  reply; host-key SSH renew
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
updated_date: '2026-09-25 18:27'
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
- [x] #1 No code on the gateway can compute a TOTP
- [x] #2 just check and the QEMU e2e pass
- [x] #3 Released and pinned in the install flow
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done — released v0.3.0** (CI build + QEMU e2e 52/52), pinned in iotgw-kestra 450fba4, gw-c3 updated in place.
- `internal/totp` deleted; `internal/seal`; vpn refresh needs -otp; ssh refresh renews by host key; daemon self-renews; console [v]/[s] code prompts (masked in the Action panel); LuCI code required for VPN.
- gw-c3 hardware: operator code → sealed VPN refresh applied, tunnel UP; same code again → 401 already used; no code → refused; ssh refresh with no code → renewed by host key.
<!-- SECTION:NOTES:END -->
