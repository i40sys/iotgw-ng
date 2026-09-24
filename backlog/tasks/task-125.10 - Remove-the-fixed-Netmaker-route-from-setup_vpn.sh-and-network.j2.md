---
id: TASK-125.10
title: Remove the fixed Netmaker route from setup_vpn.sh and network.j2
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 08:37'
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
- [ ] #1 Neither file writes a route to the Netmaker server
- [ ] #2 Install + provisioning on a test gateway still reach the VPN (route created by the daemon)
<!-- AC:END -->
