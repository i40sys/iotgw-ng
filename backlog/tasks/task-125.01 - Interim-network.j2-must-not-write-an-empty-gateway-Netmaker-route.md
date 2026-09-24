---
id: TASK-125.01
title: 'Interim: network.j2 must not write an empty-gateway Netmaker route'
status: To Do
assignee: []
created_date: '2026-09-24 07:00'
labels:
  - openwrt
  - vpn
  - kestra
dependencies: []
parent_task_id: TASK-125
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Interim guard** until the agent owns the route (decision-032 §9).

- `templates/network.j2` (provisioning, `tasks/system.yaml`) writes `config route … option gateway '{{ ip_route_default_gw }}'`.
- With an empty value it produces an on-link route to the Netmaker server → `wg0` never handshakes (the `gw-c3` failure, 2026-09-24).
- Mirror the `setup_vpn.sh` fix (iotgw-kestra `66dfeb2`): emit the route only when a gateway is set.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 network.j2 renders no config route when ip_route_default_gw is empty/undefined
- [ ] #2 With a gateway set, output is unchanged
- [ ] #3 Pushed to i40sys/iotgw-kestra main
<!-- AC:END -->
