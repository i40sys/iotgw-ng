---
id: TASK-125.06
title: 'Persistent Internet policy ([i]) and hold mode in /etc/config/iotgw'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 09:19'
labels:
  - live-image
  - openwrt
dependencies:
  - TASK-125.05
parent_task_id: TASK-125
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**decision-032 §5, §8.**

- `internet_policy = lan | vpn | auto` in `/etc/config/iotgw`; `[i]` and `iotgw internet …` change it; survives reboot (live image stays per-boot).
- `iotgw hold enable|disable`, persistent: daemon keeps monitoring/recording but makes **no** automatic change to network, routes, VPN or SSH; manual subcommands still work.
- Dashboard shows hold clearly: active, since when, and that automatic repair is suspended and why.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Policy persists across reboot and is applied by the daemon
- [x] #2 With hold enabled the daemon performs no automatic change (verified by breaking the route)
- [x] #3 Hold is clearly visible on the dashboard with its meaning
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.** `internet_policy` auto|lan|vpn (+ `prefer`) in /etc/config/iotgw; `iotgw internet …` persists and applies pinned modes at once (transaction). `iotgw hold enable [-reason]|disable|status`: the daemon keeps observing and records "held" changes; manual commands still work.

**Verified:** QEMU e2e (`just e2e`, live-image/test/qemu/run.sh): PASS 33 FAIL 0 on two OpenWRT 23.05.4 VMs (TCG) — policy survives a power cycle, hold freezes a broken route until disabled; hold banner render test.
<!-- SECTION:NOTES:END -->
