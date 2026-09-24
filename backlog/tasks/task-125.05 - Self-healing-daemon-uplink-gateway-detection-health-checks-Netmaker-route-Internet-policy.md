---
id: TASK-125.05
title: >-
  Self-healing daemon: uplink/gateway detection, health checks, Netmaker route,
  Internet policy
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 09:19'
labels:
  - live-image
  - openwrt
  - vpn
dependencies:
  - TASK-125.03
parent_task_id: TASK-125
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**decision-032 §4, §5, §7.** `iotgw daemon` (procd service), at boot and ≈ every minute:

1. detect the LAN uplink and the **current** LAN router;
2. check DNS, IP, HTTPS, WireGuard handshake, Netmaker server reachability;
3. keep the pinned route to the Netmaker server via the current router (replaces the install-time route);
4. apply the Internet policy (default LAN preferred, VPN fallback).

**Safety:** every change transactional (snapshot → apply → verify egress/VPN → commit or restore); rate limit; hysteresis (no LAN⇄VPN flapping); backoff after repeated failures. An automatic change never leaves the gateway without a working egress path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Changing the LAN router/DHCP gateway re-points the Netmaker route and the VPN handshakes again without reboot
- [x] #2 A change that breaks egress is rolled back automatically
- [x] #3 No flapping under an intermittent uplink (hysteresis + backoff verified)
- [x] #4 All actions logged to syslog
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.** `iotgw daemon` (procd): uplink + current router from ubus; Internet probes bound to the uplink and to wg0 (SO_BINDTODEVICE); handshake; owns `network.iotgw_endpoint` (Netmaker /32 via the CURRENT router; deletes the install-time route); routes the Netmaker network through wg0; LAN/VPN egress by metric (uplink 0/20 vs wg0 5). Transactions: snapshot → commit → reload (+ `ifup wg0` when the tunnel changes — netifd's reload does not re-run WireGuard setup) → verify ≤60 s → restore. Hysteresis 3 checks, rate limit 3/15 min (configurable), backoff 1→30 min; everything to syslog (`logread -e iotgw`).

**Verified:** unit tests (policy, limiter, UCI ops incl. the gw-c3 config, rollback) + QEMU e2e (`just e2e`, live-image/test/qemu/run.sh): PASS 33 FAIL 0 on two OpenWRT 23.05.4 VMs (TCG): gw-c3 on-link route reproduced and repaired, router change followed, LAN loses Internet → VPN, return after hysteresis.
<!-- SECTION:NOTES:END -->
