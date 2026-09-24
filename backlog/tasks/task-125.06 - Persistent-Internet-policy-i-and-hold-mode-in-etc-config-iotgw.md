---
id: TASK-125.06
title: 'Persistent Internet policy ([i]) and hold mode in /etc/config/iotgw'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 08:37'
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
- [ ] #1 Policy persists across reboot and is applied by the daemon
- [ ] #2 With hold enabled the daemon performs no automatic change (verified by breaking the route)
- [ ] #3 Hold is clearly visible on the dashboard with its meaning
<!-- AC:END -->
