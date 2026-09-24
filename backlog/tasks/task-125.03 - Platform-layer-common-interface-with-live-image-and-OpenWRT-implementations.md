---
id: TASK-125.03
title: 'Platform layer: common interface with live-image and OpenWRT implementations'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 09:19'
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
- [x] #1 Interface covers routes, WireGuard, DNS, service reload, logging, persistent config
- [x] #2 OpenWRT implementation changes state only through UCI/ubus and survives a network reload
- [x] #3 Collectors run on OpenWRT without sudo/systemd/journald and report UNKNOWN (not a guess) when data is unavailable
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.**
- `internal/cli` Gateway interface (Internet / VPNRefresh / SSHRefresh): live image = bootstrap (wg-quick, resolv.conf, systemd), OpenWRT = agent (UCI + netifd, procd, transactions). Platform auto-detected (`/etc/openwrt_release`, override IOTGW_PLATFORM).
- `internal/platform` (sshd state/reload/restart), `internal/uci` (CLI client, show parser, snapshots), `internal/iproute` (text parser for iproute2 + BusyBox — OpenWRT has no `ip -j`).
- DNS on OpenWRT is deliberately left to dnsmasq (decision-032 "Implementation choices").
- Collectors run as root on OpenWRT (no sudo), no systemctl, and report UNKNOWN when data is unreadable.

**Verified:** unit tests + QEMU e2e (`just e2e`, live-image/test/qemu/run.sh): PASS 33 FAIL 0 on two OpenWRT 23.05.4 VMs (TCG) (changes survive a network reload and a power cycle).
<!-- SECTION:NOTES:END -->
