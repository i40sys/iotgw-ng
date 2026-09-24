---
id: TASK-127
title: Installed OpenWRT has no root password (LuCI/ssh warning)
status: To Do
assignee: []
created_date: '2026-09-24 12:50'
labels:
  - security
  - openwrt
  - kestra
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Found on gw-c3 (2026-09-24):** after `install`, OpenWRT has no root password — LuCI shows "No password set!" and the web UI accepts an empty password (anyone on the LAN can log in as root and reach every ubus object, including the iotgw actions).

**Decide:** set a per-device root password at install (stored where? KMS like the SSH keys) or disable password login entirely (LuCI still needs a login — so a password is needed), and whether LuCI should listen only on LAN/VPN.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A freshly installed gateway has a non-empty, per-device root password (or a documented alternative)
- [ ] #2 The decision is recorded
<!-- AC:END -->
