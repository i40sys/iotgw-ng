---
id: TASK-125
title: Installed-OpenWRT gateway agent (decision-032)
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 06:59'
updated_date: '2026-09-25 06:48'
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
- [x] #2 Router/DHCP-change recovery: covered in QEMU CI only; hardware test on gw-c3 dropped as unnecessary (user decision 2026-09-25) — NOT verified on hardware
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**All 12 subtasks Done (2026-09-24).** Released as iotgw-ng v0.2.0 (install pinned + provenance verified); main has more since then (self-enrollment, host-cert validation, console boot wait).

**Verified:** CI QEMU e2e PASS 43/43 (KVM); on gw-c3 — live image with the new binary, release install from the UI, daemon-created Netmaker route + tunnel, SSH enrollment (incl. reset after reinstall), LuCI page, provisioning reaching the gateway through the Netmaker host.

**AC#2 still open on hardware:** a LAN router/DHCP change on gw-c3 (covered in CI only).
**Follow-ups:** task-126 (vpn host-key proof), task-127 (no root password), task-129 (provisioning role breakage). Next release (v0.2.1) ships the fixes in main.

**AC#2 closed without a hardware test (user decision, 2026-09-25):**
- The gw-c3 LAN router/DHCP-change test is **dropped as unnecessary**: resilience to a LAN router change is not a requirement.
- The code stays as is. It is covered **only** by the QEMU CI e2e (case 2, "route follows the new router"); on real hardware it is **unverified and may not work**.
- gw-c3 baseline at close (read-only): agent v0.2.0-6-g78c2f81, up 15 h 48 m, VPN HEALTHY, `network.iotgw_endpoint.gateway=10.2.0.1`, egress LAN, no backoff.
- **Observed, not investigated:** at 2026-09-25 05:24 the daemon re-applied `iotgw_endpoint` with identical values (bounced `wg0`/`lan`; kept, no regression). A same-value re-apply should not happen.
<!-- SECTION:NOTES:END -->
