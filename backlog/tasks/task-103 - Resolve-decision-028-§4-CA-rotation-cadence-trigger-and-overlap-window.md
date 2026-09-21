---
id: TASK-103
title: 'Resolve decision-028 §4: CA rotation cadence, trigger and overlap window'
status: Done
assignee: []
created_date: '2026-09-14 07:08'
updated_date: '2026-09-21 05:04'
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
- [x] #3 The trust-distribution path can deliver BOTH the active and rotating anchors to a gateway and to an operator, and this is demonstrated rather than assumed
- [x] #4 There is a way to prove every device has re-issued before an old CA is retired
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Decision 2026-09-15 (decision-028 §4):** event-driven rotation only (compromise/policy), overlap ≥120 d (> 90 d host TTL, AC#2 shown), retirement gated on a fleet re-issue report. §4 → DECIDED. Open: AC#3 demonstrate both active+rotating anchors reach a gateway and an operator; AC#4 the mechanism that proves every device re-issued before retiring an old CA.

**2026-09-18 — blocker task-076 cleared, AC#3 transport now live.** The zone-scoped trust routes are reachable on pki.joor.net (pki-manager-web 6c25085 / v3.12.1, deployed on y0). `/ssh/zones/<zone>/trusted-user-ca-keys` now returns the zone User CA(s) as text/plain, and getTrustAnchors() emits both active+rotating CAs during overlap — so the single route delivers the CA PAIR (no more one-CA `ca.pub` limitation).

**Remaining for AC#3 (demonstrate, not assume):** rotate a CA in a test zone (SGCli `rotate`, ssh-ca.service.ts:228 — default overlap 371 d, > 120 d §4) and show the route returns TWO anchors; confirm the operator path (`scripts/ssh-ca/trust.sh`, which should be repointed to the scoped route) and the gateway path (ssh-ca edge fn) both receive the union.

**AC#4 still open:** fleet re-issue report proving every device re-issued under the successor before the predecessor (status 'rotating') is retired — needs a per-zone query of issued host certs vs. active CA.

**2026-09-18 — AC#3 DEMONSTRATED live on pki.joor.net (zone iotgw-ssh-ca-test).** Rotated the zone User CA and proved the scoped route serves the PAIR:
- Before: `/ssh/zones/iotgw-ssh-ca-test/trusted-user-ca-keys` → 1 key (SHA256:ES7b3t… 'iotgw-ssh-ca-test-users', active).
- Rotated CA d9aec77e via `POST /api/v1/ssh/cas/<id>/rotate` (admin OIDC via the iotgw-backend Keycloak service account). Predecessor → status 'rotating' (retireAfter ~371 d, > 120 d §4); successor → new 'active' CA 81be17dd.
- After: the SINGLE scoped route returns BOTH keys (ES7b3t… rotating + WFbXW… active), text/plain, HTTP 200. This is the exact file a gateway's TrustedUserCAKeys / an operator's trust.sh consumes — one route, the active+rotating union, no per-CA ca.pub juggling.
- State restored: zone re-archived to its original status; archived zones still serve existing trust material (confirmed still 2 keys after archive).

**Remaining integration (tracked under task-076 AC#5):** repoint the two CONSUMERS off the one-CA `/ssh/cas/:id/ca.pub` onto the scoped `trusted-user-ca-keys` route so they actually receive the pair — the ssh-ca edge fn (`_shared/pki-manager.ts`) and operator `scripts/ssh-ca/trust.sh`. The distribution PATH is proven; the clients still fetch a single anchor.

**pki-manager bug found (not iotgw-ng):** `SshCaService.rotate()` demotes the predecessor to 'rotating' BEFORE creating the successor, with no archived-zone guard and no transaction. On an ARCHIVED zone the create is rejected ("zone archived") but the demote already committed → the zone is left with a rotating-only CA and NO active one. Recovered by unarchive → create successor → re-archive. rotate() should gate on zone.status!='archived' (and/or create-then-demote atomically). Worth a task in oriolrius/pki-manager-web.

**2026-09-21 — AC#3 consumer repoint DONE (was the remaining integration).** Both consumers now receive the active+rotating PAIR over the zone-scoped routes (see task-076 AC#5): the ssh-ca edge function (`_shared/pki-manager.ts` `zoneTrustAnchors` + `ssh-ca/index.ts`) and operator `scripts/ssh-ca/trust.sh`. trust.sh live-tested against pki.joor.net. AC#3 fully met end-to-end (route delivers the pair + both clients consume it).

Remaining on task-103: AC#4 (fleet re-issue report). Also the pki-manager rotate() atomicity bug found during the AC#3 demo is fixed (pki-manager-web TASK-235, released v3.12.2).

**2026-09-21 — AC#4 DONE. Fleet re-issue report = the retirement gate.**
- pki-manager endpoint `GET /api/v1/ssh/cas/:caId/reissue-report` (oriolrius/pki-manager-web TASK-236, released v3.12.3, deployed on y0): a CA is safe to retire iff it has signed zero still-LIVE certs (status='active', NOT superseded, not past validBefore). Returns {ca, successorCaId, liveCertsUnderThisCa, reissuedUnderSuccessor, safeToRetire, pending[]}. Integration test proves unsafe (1 pending on predecessor) → re-issue under successor → safe (0), against real KMS.
- iotgw-ng operator tool `scripts/ssh-ca/fleet-report.sh`: calls the endpoint per rotating CA, prints per-device "not re-issued" list + SAFE TO RETIRE verdict, exits 2 while any device is still on an old CA (gate-able). README §3b documents rotate→prove→retire.
- Live-verified on pki.joor.net 3.12.3: endpoint returns the report shape; fleet-report.sh runs against the deployed endpoint (no rotating CAs now → exit 0).

All four ACs met → task DONE. decision-028 §4 fully realized: event-driven rotation, ≥120 d overlap, both anchors delivered to gateway+operator (task-076), and retirement gated on this report.
<!-- SECTION:NOTES:END -->
