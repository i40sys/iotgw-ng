---
id: TASK-125.10
title: Remove the fixed Netmaker route from setup_vpn.sh and network.j2
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 11:16'
labels:
  - openwrt
  - vpn
  - kestra
dependencies:
  - TASK-125.05
  - TASK-125.09
parent_task_id: TASK-125
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**decision-032 §9.** Once the daemon owns the route, Ansible only writes the WireGuard key/peer and initial data.

- Drop the `config route` block from `files/setup_vpn.sh` and `templates/network.j2`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Neither file writes a route to the Netmaker server
- [ ] #2 Install + provisioning on a test gateway still reach the VPN (route created by the daemon)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Implemented** on iotgw-kestra branch `task-125-iotgw-agent`: neither files/setup_vpn.sh nor templates/network.j2 writes a route to the VPN endpoint; the unused gateway parsing and d01's dummy vpn_* vars are gone.

**Pending AC#2:** a real install + provisioning run once the release is pinned (task-125.09).

**On gw-c3 (2026-09-24):** after an install with these files, `/etc/config/network` had no route to the Netmaker server. The daemon created `network.iotgw_endpoint` (via 10.2.0.1) on its first check, the tunnel came up, and the Kestra connectivity-check (via the Netmaker host) passed. Enrollment was done with `iotgw ssh refresh`. The Kestra `provisioning` flow itself was not re-run, so AC#2 stays open until it is.
<!-- SECTION:NOTES:END -->
