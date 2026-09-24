---
id: TASK-125.12
title: LuCI page Status → IoGW NG backed by the daemon's snapshot
status: Done
assignee: []
created_date: '2026-09-24 12:50'
updated_date: '2026-09-24 13:05'
labels:
  - live-image
  - openwrt
  - luci
dependencies: []
parent_task_id: TASK-125
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**decision-032 §11.** A LuCI page with the console dashboard's information and actions, on the same backend.

- Daemon publishes the full status (`/var/run/iotgw/status.json`, SIGUSR1 = refresh now); console dashboard + LuCI + `iotgw rpcd` read it; `[q]` closes only the viewer.
- LuCI 23.05 client-side view `view/iotgw/status.js`, menu `admin/status/iotgw` ("IoGW NG"), rpcd exec plugin `/usr/libexec/rpcd/iotgw` (ubus `iotgw`), ACL `luci-app-iotgw`; long actions as background jobs.
- Delivered in the `iotgw-openwrt` package (install playbook + sysupgrade list).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Status menu shows IoGW NG and the page renders every panel of the console dashboard
- [x] #2 Actions work from the page: refresh, policy, hold, VPN refresh, SSH refresh (optional code, force)
- [x] #3 The page and the console read the daemon's snapshot; anonymous ubus calls are denied
- [x] #4 Installed by the install playbook; covered by the QEMU e2e
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.** Status → IoGW NG on OpenWRT 23.05 LuCI (client-side view), rpcd exec plugin `iotgw rpcd` (ubus `iotgw`: status, refresh, set_policy, hold, vpn_refresh, ssh_refresh, job), ACL `luci-app-iotgw` (read: status, job; write: actions), menu `admin/status/iotgw`.

**Backend:** the daemon publishes `/var/run/iotgw/status.json` (5 s / 30 s probes, SIGUSR1 = now); the console dashboard reads it too (probes itself only when stale) — `[q]` closes the viewer, the daemon keeps running. A change lock serializes daemon and manual changes. Long actions = detached jobs (rpcd exec timeout 30 s).

**Verified:** on gw-c3 (page renders every panel; VPN refresh job, hold on/off through /ubus with a LuCI session; anonymous call denied) + QEMU e2e PASS 40/40 incl. the package extracted the playbook's way.

**Follow-up:** task-127 (installed OpenWRT has no root password — LuCI warns).
<!-- SECTION:NOTES:END -->
