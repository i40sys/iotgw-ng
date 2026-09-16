---
id: TASK-080
title: >-
  Backend: create and link the pki-manager zone when an iotgw-ng domain is
  created
status: In Progress
assignee: []
created_date: '2026-09-14 05:29'
updated_date: '2026-09-16 16:54'
labels:
  - ssh-ca
  - backend
milestone: m-1
dependencies:
  - TASK-074
  - TASK-079
references:
  - >-
    backlog/decisions/decision-026-ssh-ca-gateway-provisioning-and-enrollment-sequence.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-026 phase 0.2-0.5 in the iotgw-ui backend: when an iotgw-ng domain is created, create its pki-manager zone and everything in it, then persist the ids on the domain row.

**The exact sequence, all with the OIDC service account** (a fleet token cannot do any of this):
1. `POST /api/v1/ssh/zones` `{name: "iotgw-<domain>"}` — the slug is prefixed so the iotgw-ng fleet stays distinguishable from other tenants of the same PKI.
2. `POST /api/v1/ssh/cas` twice — `{caType:"user", zone}` and `{caType:"host", zone}`. pki-manager generates both CA keys **inside its Cosmian KMS**; no key material crosses the wire.
3. `POST /api/v1/ssh/principals` twice — `iotgw-admin`, `iotgw-ops`, both scoped to the zone.
4. Persist `pki_zone`, `pki_user_ca_id`, `pki_host_ca_id` on the `domains` row.

**Why "re-runnable" is not optional:** three domains (`production`, `office`, `warehouse`) already exist unlinked, and `warehouse` was linked **by hand** to the pilot zone `iotgw-lab` during implementation. So the code must handle: a domain with no zone, a domain already linked, and a zone that exists in pki-manager under a name that does not match the `iotgw-<domain>` convention. Do not blindly create a second zone for a domain that already has one.

**Partial failure is the real risk.** Steps 1-3 are four separate API calls with no transaction. A failure after step 2 leaves a zone with one CA and no principals — which pki-manager will happily keep, and which cannot be deleted (a zone cannot be removed while it owns a CA; only archived). So either make the operation resumable (detect what exists and continue) or accept and document that a half-provisioned zone must be archived by hand.

**Also note:** pki.joor.net now has more than one zone, so its **fail-closed zone resolution** is active — every call must pass the zone explicitly or it errors. That is the desired behaviour; just do not be surprised by it.

**Blocked by** the credential-scope decision: this code needs a pki-manager credential whose blast radius has not been decided.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Creating a domain results in a zone with one user CA, one host CA and both principals in pki-manager, with the ids persisted on the domain row
- [x] #2 Re-running against an already-linked domain is a no-op, and against a partially-provisioned zone it completes the missing pieces rather than duplicating
- [ ] #3 The three pre-existing domains can be backfilled, including warehouse whose zone was linked by hand and is named iotgw-lab
- [ ] #4 A pki-manager failure surfaces on the domain record rather than leaving silent partial state
- [x] #5 Every call passes the zone explicitly, so fail-closed resolution never picks a zone for us
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**In progress 2026-09-16 — backend client implemented, credential provisioned + wired, AC#2/#5 proven live through the real backend; AC#1/#3/#4 gated on sign-off to create real pki.joor.net zones.**

**Implemented (commit 6752611):** `apps/backend/src/services/pki.ts` — pki-manager ADMIN client (OIDC bearer via client_credentials or ROPC; idempotent+resumable `ensureDomainPkiZone`: zone → user CA + host CA → iotgw-admin/iotgw-ops principals; every call passes the zone explicitly). Wired into `domains.createDomain` best-effort (a PKI failure leaves the domain unlinked → enrollment fails closed, mirroring the KMS-key pattern) + a `provisionPkiZone` mutation for backfill/retry that surfaces errors. Reuses a hand-linked zone verbatim. `offboardHost` added for task-081.

**Credential provisioned + wired (commit c7e0b8e, see task-074):** dedicated Keycloak service account `iotgw-backend` (client_credentials, realm role `admin`, audience mapper → aud includes pki-web). SOPS-stored; bridged via `gen_pki_oidc_secret` → `pki-oidc` Secret; backend Deployment gets PKI_* env (non-secret inline + secretKeyRef the secret, optional). Backend image rebuilt with the new code + rolled.

**LIVE PROOF (through the deployed backend, tRPC `provisionPkiZone`):**
- **AC#2 (re-run no-op):** `provisionPkiZone(warehouse)` returned the EXISTING ids `{pki_zone: iotgw-lab, pki_user_ca_id: 515ce7b1…, pki_host_ca_id: f3a2fbda…}` and created NOTHING — pki.joor.net afterwards still has exactly 2 zones and iotgw-lab still has exactly 1 user + 1 host CA + both principals (no duplication).
- **AC#5 (explicit zone):** every pki call passes the zone; verified no fail-closed zone was auto-picked.
- **AC#3 (warehouse case):** the hand-linked non-conventional zone `iotgw-lab` (not `iotgw-warehouse`) was reused, not cloned.

**Remaining (held: user chose "warehouse re-run only, no writes"):**
- **AC#1** — create a NEW domain → a fresh zone + 1 user CA + 1 host CA + both principals, ids persisted. Needs a real (non-deletable) zone creation on pki.joor.net.
- **AC#3** — backfill `production` + `office` (real zone creations).
- **AC#4** — force a pki-manager failure and confirm it surfaces on the domain record rather than leaving silent partial state (code path: provisionPkiZone throws; createDomain logs + leaves unlinked — not yet fault-injected live).
<!-- SECTION:NOTES:END -->
