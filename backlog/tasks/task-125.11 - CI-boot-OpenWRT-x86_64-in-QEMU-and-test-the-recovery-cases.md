---
id: TASK-125.11
title: 'CI: boot OpenWRT x86_64 in QEMU and test the recovery cases'
status: To Do
assignee: []
created_date: '2026-09-24 07:00'
labels:
  - live-image
  - openwrt
  - ci
dependencies:
  - TASK-125.05
  - TASK-125.07
  - TASK-125.08
parent_task_id: TASK-125
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**decision-032 Consequences; decision-029 QEMU approach.**

Cases: LAN router change, lost/empty route, VPN down → fallback, breaking change → rollback, hold mode, `vpn refresh`, `ssh refresh`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CI job boots OpenWRT x86_64 with the iotgw binary
- [ ] #2 The listed recovery cases pass in CI
<!-- AC:END -->
