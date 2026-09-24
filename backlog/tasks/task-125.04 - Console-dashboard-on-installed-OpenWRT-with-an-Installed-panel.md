---
id: TASK-125.04
title: Console dashboard on installed OpenWRT with an Installed panel
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 09:19'
labels:
  - live-image
  - openwrt
dependencies:
  - TASK-125.03
parent_task_id: TASK-125
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**decision-032 §3.** `iotgw status` on the OpenWRT console, screen **and** serial, at boot.

- Same panels as the live image; **Provisioning → Installed** showing: installed, provisioned, valid SSH host cert, VPN status, Internet status, active uplink (LAN/VPN).
- Shows hold mode prominently when active (see hold task).
- Dashboard is read-mostly; repair runs in the daemon.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dashboard starts automatically on tty1 and the serial console after boot
- [x] #2 Installed panel shows the six items listed
- [x] #3 Works at 80x24 and without colour, as on the live image
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.** OpenWRT dashboard: Installed panel (installed / provisioned / SSH certificate / VPN / Internet / active uplink), Self-healing agent panel, hold banner, [i] policy chooser (auto/lan/vpn), [h] hold toggle; a serial console reporting 0x0 gets 80x24. `/usr/libexec/iotgw-console` via inittab respawn on tty1 + ttyS0, then the normal login.

**Verified:** render tests at 80 columns (tui/view_owrt_test.go); QEMU e2e (`just e2e`, live-image/test/qemu/run.sh): PASS 33 FAIL 0 on two OpenWRT 23.05.4 VMs (TCG) — the dashboard runs on the console and is drawn on the serial console after a power cycle.
<!-- SECTION:NOTES:END -->
