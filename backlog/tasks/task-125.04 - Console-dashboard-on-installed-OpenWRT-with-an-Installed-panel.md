---
id: TASK-125.04
title: Console dashboard on installed OpenWRT with an Installed panel
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 08:37'
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
- [ ] #1 Dashboard starts automatically on tty1 and the serial console after boot
- [ ] #2 Installed panel shows the six items listed
- [ ] #3 Works at 80x24 and without colour, as on the live image
<!-- AC:END -->
