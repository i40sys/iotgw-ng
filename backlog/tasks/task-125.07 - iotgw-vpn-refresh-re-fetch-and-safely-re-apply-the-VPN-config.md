---
id: TASK-125.07
title: 'iotgw vpn refresh: re-fetch and safely re-apply the VPN config'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 11:16'
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
- [x] #1 Auth approach decided and recorded in decision-032
- [x] #2 vpn refresh applies a changed peer/key and the VPN comes back
- [x] #3 A bad config is rolled back and the gateway keeps its egress path
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.** `iotgw vpn refresh [-otp CODE]`: vpn API → UCI wg0 + peer (+ endpoint route), transaction with `ifup wg0`; kept if the tunnel comes up, rolled back if it was up and is not, kept if it was down both before and after. Saves /etc/iotgw/wg0.server.conf and network_cidr.

**Auth (AC#1):** operator code or derived from /etc/config/iotgw; daemon never refreshes by itself — recorded in decision-032; server-side host-key proof = task-126.

**Verified:** QEMU e2e (`just e2e`, live-image/test/qemu/run.sh): PASS 33 FAIL 0 on two OpenWRT 23.05.4 VMs (TCG) with test/fakeapi (real envelope + TOTP): a wrong key repaired; a bad peer rolled back, tunnel kept.

**Also verified against the real `vpn` function on gw-c3:** the config was fetched with the derived code and applied (only the keepalive changed), and the tunnel stayed up.
<!-- SECTION:NOTES:END -->
