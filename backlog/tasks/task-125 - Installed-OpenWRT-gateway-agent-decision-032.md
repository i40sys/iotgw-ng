---
id: TASK-125
title: Installed-OpenWRT gateway agent (decision-032)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 06:59'
updated_date: '2026-09-24 15:43'
labels:
  - live-image
  - openwrt
  - vpn
  - ssh-ca
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Epic.** Implement decision-032: evolve the live-image Go module into one `iotgw` binary that also runs on the installed OpenWRT gateway — console dashboard, self-healing uplink/VPN daemon, persistent Internet policy, hold mode, and on-demand `vpn refresh` / `ssh refresh` — so an installed gateway keeps and recovers its own management path without reboot or reinstall.

**Why:** a static install-time route to the Netmaker server left `gw-c3` unreachable (on-link route, empty gateway — 2026-09-24).

**Scope:** subtasks below. Central provisioning / pki-manager stay the authority; the gateway is a client.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All subtasks Done
- [ ] #2 An installed gateway recovers its VPN management path after a LAN router/DHCP change without reboot, verified in the QEMU CI job and on gw-c3
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**All 12 subtasks Done (2026-09-24).** Released as iotgw-ng v0.2.0 (install pinned + provenance verified); main has more since then (self-enrollment, host-cert validation, console boot wait).

**Verified:** CI QEMU e2e PASS 43/43 (KVM); on gw-c3 — live image with the new binary, release install from the UI, daemon-created Netmaker route + tunnel, SSH enrollment (incl. reset after reinstall), LuCI page, provisioning reaching the gateway through the Netmaker host.

**AC#2 still open on hardware:** a LAN router/DHCP change on gw-c3 (covered in CI only).
**Follow-ups:** task-126 (vpn host-key proof), task-127 (no root password), task-129 (provisioning role breakage). Next release (v0.2.1) ships the fixes in main.
<!-- SECTION:NOTES:END -->
