---
id: TASK-125.09
title: Deliver iotgw on installed OpenWRT via the install playbook (pinned version)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 09:19'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Implemented (not yet released).**
- iotgw-ng: `just openwrt` → iotgw-openwrt-linux-<arch>.tar.gz (/usr/sbin/iotgw, /etc/init.d/iotgw, /usr/libexec/iotgw-console), published by CI with SHA256SUMS.
- iotgw-kestra branch `task-125-iotgw-agent` (da9fa57): tasks/iotgw_agent.yaml (tarball, /etc/config/iotgw from the flow identity + the live image's api_base, wg0.server.conf, rc.d links, inittab, sysupgrade.conf), vars/iotgw.yml pin, install-flow passes the identity.

**Blocked on a release:** vars/iotgw.yml holds a placeholder SHA256 until an iotgw-ng v* tag publishes the tarball — the branch must not be merged before that. The QEMU e2e reproduces the playbook's result, not the playbook run itself.
<!-- SECTION:NOTES:END -->
