---
id: TASK-125
title: Installed-OpenWRT gateway agent (decision-032)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 06:59'
updated_date: '2026-09-24 08:37'
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
- [ ] #1 All subtasks Done
- [ ] #2 An installed gateway recovers its VPN management path after a LAN router/DHCP change without reboot, verified in the QEMU CI job and on gw-c3
<!-- AC:END -->
