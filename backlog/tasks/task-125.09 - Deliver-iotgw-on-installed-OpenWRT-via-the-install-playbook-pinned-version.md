---
id: TASK-125.09
title: Deliver iotgw on installed OpenWRT via the install playbook (pinned version)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 08:37'
labels:
  - live-image
  - openwrt
  - kestra
dependencies:
  - TASK-125.04
  - TASK-125.05
parent_task_id: TASK-125
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**decision-032 §10.** `d01_install_owrt.yml` copies into the installed rootfs:

- the static binary (explicitly pinned version from live-image CI),
- `/etc/config/iotgw` defaults (policy `lan`, hold off),
- procd init script for the daemon, console entries (tty1 + serial) for the dashboard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A fresh install boots with the daemon running and the dashboard on the console
- [ ] #2 The installed version matches the pinned one
<!-- AC:END -->
