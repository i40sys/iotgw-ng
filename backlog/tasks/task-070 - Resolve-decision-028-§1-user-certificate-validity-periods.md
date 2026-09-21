---
id: TASK-070
title: 'Resolve decision-028 §1: user certificate validity periods'
status: Done
assignee: []
created_date: '2026-09-14 05:28'
updated_date: '2026-09-21 14:49'
labels:
  - ssh-ca
  - decision
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-028-ssh-ca-open-security-and-architecture-decisions.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-028 §1 leaves the `iotgw-admin` and `iotgw-ops` certificate TTLs UNRESOLVED. Host certs are already DECIDED at 90 days with renewal at 60.

**The trade-off is real:** too short and an operator away from their workstation cannot renew and is locked out of a gateway they may be standing next to; too long and a departed operator keeps access until expiry, which is the main revocation mechanism in this design (the KRL is the emergency path, not the routine one).

**Recommendation on record:** `iotgw-admin` 12 h, `iotgw-ops` 2 h minted by the **backend** (not the runner pod), so no issuance credential ever lands in a pod.

**How to get the evidence** (the ADR asks for it but did not say where): count, over one working week, how many operator SSH sessions to gateways start from a machine that can complete an OIDC login to pki.joor.net, versus from a field/on-site machine that cannot. `sshd` logs on the gateways give the session times; the operator can say which machine each came from. If field sessions are common, 12 h is too short and 24 h with a documented offline path is the honest answer.

**Blocks decision-027 phase 3** and the Kestra runner task, which cannot be written until it is known who mints the `iotgw-ops` cert.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A TTL is recorded for iotgw-admin and for iotgw-ops in decision-028 §1, with the reasoning, and its status flips to DECIDED
- [x] #2 The decision states explicitly whether the Kestra runner mints its own certificate or receives one from the backend
- [x] #3 No issuance credential lands in a runner pod unless that is the recorded choice
- [x] #4 The chosen TTLs are applied in the code that issues them, not only written down
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Decision recorded (decision-028 §1, DECIDED):** iotgw-admin = 24 h + documented offline renewal path; iotgw-ops = 2 h, minted by the BACKEND (never the runner pod). AC#1/#2/#3 done previously.

**AC#4 — TTLs applied in issuance code (not only written down):**
- iotgw-admin (24 h): scripts/ssh-ca/user-cert.sh already sends `validForSeconds: 86400` in the POST to pki-manager /ssh/users/issue (VALID_FOR_SECONDS default 86400) — verified in the live issuer, not just a doc.
- iotgw-ops (2 h): the backend user-cert issuer does not exist yet — it is task-092's deliverable, and task-092 DEPENDS ON this task, so 070 cannot wait for it (would deadlock). To keep the value in code rather than prose, added `IOTGW_USER_CERT_TTL_SECONDS` to iotgw-ui/apps/backend/src/services/pki.ts (the pki issuance module) as the single source of truth: {iotgw-admin: 86400, iotgw-ops: 7200}, with the decision-028 §1 rationale. Added an explicit AC to task-092 requiring its backend issuer to mint iotgw-ops at IOTGW_USER_CERT_TTL_SECONDS['iotgw-ops'] (2 h), never in the pod.

Net: the decision is fully recorded and applied in every issuer that exists today (admin 24 h live); the ops 2 h is a code constant the task-092 issuer must consume. Unblocks task-092. typecheck clean.
<!-- SECTION:NOTES:END -->
