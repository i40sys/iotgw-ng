---
id: TASK-125.07
title: 'iotgw vpn refresh: re-fetch and safely re-apply the VPN config'
status: To Do
assignee: []
created_date: '2026-09-24 07:00'
labels:
  - live-image
  - openwrt
  - vpn
dependencies:
  - TASK-125.03
parent_task_id: TASK-125
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**decision-032 §6.** Without reboot or reinstall:

1. re-request the WireGuard/Netmaker config from the `vpn` API;
2. update keys/peer/params; apply through UCI; reload only the needed network part;
3. validate handshake + egress; roll back on failure.

**Open point (decision-032):** authentication. The TOTP inputs are non-secret; `vpn` returns the private key. Decide: operator one-time code (as `iotgw-bootstrap -otp`) and/or add a host-key proof (task-075 style) to the `vpn` function for unattended refresh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Auth approach decided and recorded in decision-032
- [ ] #2 vpn refresh applies a changed peer/key and the VPN comes back
- [ ] #3 A bad config is rolled back and the gateway keeps its egress path
<!-- AC:END -->
