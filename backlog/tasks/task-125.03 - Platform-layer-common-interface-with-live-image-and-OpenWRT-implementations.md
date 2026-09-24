---
id: TASK-125.03
title: 'Platform layer: common interface with live-image and OpenWRT implementations'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 08:37'
labels:
  - live-image
  - openwrt
dependencies:
  - TASK-125.02
parent_task_id: TASK-125
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**decision-032 §2.** Functional logic common; system changes behind an interface (conceptually `NetworkManager`).

- **Live image:** current behaviour (`ip`, `wg-quick`, `/etc/resolv.conf`, systemd, `sudo -n`, journald).
- **OpenWRT:** `uci` + netifd/`ubus`, DNS via dnsmasq/UCI, procd, root, `logger`; config `/etc/config/iotgw`, runtime `/var/run/iotgw/`.
- Never edit files OpenWRT regenerates. Platform auto-detected at runtime.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Interface covers routes, WireGuard, DNS, service reload, logging, persistent config
- [ ] #2 OpenWRT implementation changes state only through UCI/ubus and survives a network reload
- [ ] #3 Collectors run on OpenWRT without sudo/systemd/journald and report UNKNOWN (not a guess) when data is unavailable
<!-- AC:END -->
