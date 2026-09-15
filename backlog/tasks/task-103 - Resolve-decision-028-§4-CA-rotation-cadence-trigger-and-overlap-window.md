---
id: TASK-103
title: 'Resolve decision-028 §4: CA rotation cadence, trigger and overlap window'
status: In Progress
assignee: []
created_date: '2026-09-14 07:08'
updated_date: '2026-09-15 05:06'
labels:
  - ssh-ca
  - decision
milestone: m-1
dependencies:
  - TASK-076
references:
  - >-
    backlog/decisions/decision-028-ssh-ca-open-security-and-architecture-decisions.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-028 §4 leaves this UNRESOLVED and no task covered it. The mechanism is not in question — pki-manager supports one `active` + one `rotating` CA per `(zone, ca_type)` and publishes both anchors during the overlap. The cadence and the trigger are.

**The binding constraint:** a gateway only picks up new anchors when it enrolls or renews, and host certs are 90 days (decision-028 §1). So the overlap window must comfortably exceed 90 days or a gateway that renews late will trust neither CA.

**Recommendation on record:** no scheduled rotation; rotate on compromise or a documented policy event, with a >=120-day overlap and a fleet report proving every device re-issued before the old CA is retired.

**Unverified prerequisite:** it is not established that `/ssh/cas/:id/ca.pub` — the route both the edge function and `scripts/ssh-ca/trust.sh` use — can express a CA **pair**. It returns one CA by id, so during an overlap a gateway would get only one anchor. That is an argument for finishing the zone-scoped trust routes first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 decision-028 §4 records a rotation trigger and an overlap window, and its status flips to DECIDED
- [x] #2 The overlap window is shown to exceed the host-certificate TTL with margin
- [ ] #3 The trust-distribution path can deliver BOTH the active and rotating anchors to a gateway and to an operator, and this is demonstrated rather than assumed
- [ ] #4 There is a way to prove every device has re-issued before an old CA is retired
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Decision 2026-09-15 (decision-028 §4):** event-driven rotation only (compromise/policy), overlap ≥120 d (> 90 d host TTL, AC#2 shown), retirement gated on a fleet re-issue report. §4 → DECIDED. Open: AC#3 demonstrate both active+rotating anchors reach a gateway and an operator; AC#4 the mechanism that proves every device re-issued before retiring an old CA.
<!-- SECTION:NOTES:END -->
