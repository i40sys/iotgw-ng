---
id: TASK-125.09
title: Deliver iotgw on installed OpenWRT via the install playbook (pinned version)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 14:37'
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
- [x] #1 A fresh install boots with the daemon running and the dashboard on the console
- [ ] #2 The installed version matches the pinned one
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Implemented (not yet released).**
- iotgw-ng: `just openwrt` → iotgw-openwrt-linux-<arch>.tar.gz (/usr/sbin/iotgw, /etc/init.d/iotgw, /usr/libexec/iotgw-console), published by CI with SHA256SUMS.
- iotgw-kestra branch `task-125-iotgw-agent` (da9fa57): tasks/iotgw_agent.yaml (tarball, /etc/config/iotgw from the flow identity + the live image's api_base, wg0.server.conf, rc.d links, inittab, sysupgrade.conf), vars/iotgw.yml pin, install-flow passes the identity.

**Blocked on a release:** vars/iotgw.yml holds a placeholder SHA256 until an iotgw-ng v* tag publishes the tarball — the branch must not be merged before that. The QEMU e2e reproduces the playbook's result, not the playbook run itself.

**AC#1 verified on gw-c3 (2026-09-24):** the branch playbook with a local tarball (`iotgw_openwrt_src`) reinstalled gw-c3 from the new live image (45 ok, 0 failed). On first boot `iotgw daemon` ran (procd) and the dashboard came up on tty1 + ttyS0. `/etc/config/iotgw` held the full identity, with `api_base` taken from the live image. AC#2 (the pinned release) is still pending the v* tag.
**Found and fixed:** the dashboard started while boot messages were still printing to the console (the launcher now waits for the boot to settle and silences kernel console output).

**Released + pinned (2026-09-24):** iotgw-ng v0.2.0 publishes `iotgw-openwrt-linux-amd64.tar.gz`. The SHA256 b72e145d… was checked against a fresh download, and its provenance verified. It is pinned in iotgw-kestra vars/iotgw.yml, the branch is merged to main (2a4b504), and the Kestra `install` flow is at revision 6.
**AC#2 pending:** one install run through the UI/Kestra (runner downloads the pinned tarball).
<!-- SECTION:NOTES:END -->
