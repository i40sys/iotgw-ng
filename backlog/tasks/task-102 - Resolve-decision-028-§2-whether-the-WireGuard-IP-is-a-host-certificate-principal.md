---
id: TASK-102
title: >-
  Resolve decision-028 §2: whether the WireGuard IP is a host-certificate
  principal
status: To Do
assignee: []
created_date: '2026-09-14 07:08'
updated_date: '2026-09-14 07:35'
labels:
  - ssh-ca
  - decision
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-028-ssh-ca-open-security-and-architecture-decisions.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-028 §2 leaves this UNRESOLVED and no task covered it. The `ssh-ca` edge function currently **does** include the device's IP as a principal, so the recommendation is already in the code — it needs ratifying or reversing.

**For:** operators dial gateways by IP today (`ssh root@10.121.x.y`), and without the IP as a principal every such connection falls back to a host-key prompt, which is exactly the behaviour this migration removes.

**Against:** WireGuard IPs are reassignable. If a device is deleted and its IP recycled to another device, the old certificate — unexpired and, if nobody offboarded it, unrevoked — still validates for the new occupant's address. That is a real impersonation path, not a theoretical one.

**What decides it:** whether Netmaker actually recycles extclient IPs, and how quickly. If it does, the mitigation is to make offboard-on-delete mandatory and monitored, so a recycled IP is always preceded by a revocation — which makes this depend on the backend offboard task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Netmaker's IP reuse behaviour for deleted extclients is established by observation, not assumption
- [ ] #2 decision-028 §2 records whether the IP stays a principal and its status flips to DECIDED
- [ ] #3 If the IP stays, offboard-on-delete is mandatory and there is a check that catches a device deleted without one
- [ ] #4 The ssh-ca edge function matches the decision
<!-- AC:END -->
