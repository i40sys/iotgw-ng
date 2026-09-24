---
id: TASK-125.05
title: >-
  Self-healing daemon: uplink/gateway detection, health checks, Netmaker route,
  Internet policy
status: To Do
assignee: []
created_date: '2026-09-24 07:00'
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
- [ ] #1 Changing the LAN router/DHCP gateway re-points the Netmaker route and the VPN handshakes again without reboot
- [ ] #2 A change that breaks egress is rolled back automatically
- [ ] #3 No flapping under an intermittent uplink (hysteresis + backoff verified)
- [ ] #4 All actions logged to syslog
<!-- AC:END -->
