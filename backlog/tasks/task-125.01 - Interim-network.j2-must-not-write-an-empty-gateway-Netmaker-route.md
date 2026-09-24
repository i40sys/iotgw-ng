---
id: TASK-125.01
title: 'Interim: network.j2 must not write an empty-gateway Netmaker route'
status: Done
assignee: []
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 07:02'
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
- [x] #1 network.j2 renders no config route when ip_route_default_gw is empty/undefined
- [x] #2 With a gateway set, output is unchanged
- [x] #3 Pushed to i40sys/iotgw-kestra main
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.** `templates/network.j2` renders the Netmaker `config route` only when `ip_route_default_gw` is defined and non-empty.

**Verified:** jinja render with `''` → no route, `10.2.0.1` → route with that gateway (unchanged), undefined → no route.

**Commit:** i40sys/iotgw-kestra main (merge of `task-125.01-network-j2-route-guard`).
<!-- SECTION:NOTES:END -->
