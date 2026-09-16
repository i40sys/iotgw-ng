---
id: TASK-080
title: >-
  Backend: create and link the pki-manager zone when an iotgw-ng domain is
  created
status: Done
assignee: []
created_date: '2026-09-14 05:29'
updated_date: '2026-09-16 17:21'
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
- [x] #1 Creating a domain results in a zone with one user CA, one host CA and both principals in pki-manager, with the ids persisted on the domain row
- [x] #2 Re-running against an already-linked domain is a no-op, and against a partially-provisioned zone it completes the missing pieces rather than duplicating
- [x] #3 The three pre-existing domains can be backfilled, including warehouse whose zone was linked by hand and is named iotgw-lab
- [x] #4 A pki-manager failure surfaces on the domain record rather than leaving silent partial state
- [x] #5 Every call passes the zone explicitly, so fail-closed resolution never picks a zone for us
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done 2026-09-16 — all 5 ACs proven live through the deployed backend against pki.joor.net.**

Credential: dedicated Keycloak service account `iotgw-backend` (client_credentials + realm role admin + audience mapper for pki-web), SOPS-stored, bridged to the `pki-oidc` Secret, wired into the backend Deployment (task-074). Backend image rebuilt with the new code + rolled.

**AC#1 (create → full zone, ids persisted):** `createDomain(ssh-ca-test)` auto-provisioned a NEW zone `iotgw-ssh-ca-test` with exactly 1 user CA (d9aec77e) + 1 host CA (2f46c107) + both principals (iotgw-admin, iotgw-ops); the domain row persisted pki_zone + both ca ids.

**AC#2 (idempotent / resumable):** `provisionPkiZone(warehouse)` returned the existing {iotgw-lab, 515ce7b1, f3a2fbda} and created nothing — pki.joor.net unchanged, no duplicate CAs. Also proved resumable-after-failure: the AC#4 domain, once the credential was restored, was completed by a retry (`provisionPkiZone` → new zone `iotgw-ssh-ca-fail2`).

**AC#3 (backfill the 3 pre-existing domains):** warehouse reused its hand-linked `iotgw-lab` (not cloned); `production` → new `iotgw-production` (6b1be8e5 / 73c32ad3); `office` → new `iotgw-office` (854f46eb / afdf1892). All three domain rows now carry pki_zone + both ca ids.

**AC#4 (failure surfaces, not silent partial):** with a deliberately-invalid client secret, `createDomain(ssh-ca-fail2)` created the domain but left it UNLINKED (pki_zone/pki_user_ca_id/pki_host_ca_id all NULL) and logged an error (`pkiError status 401 … "created but pki-manager zone provisioning failed — left unlinked; retry with provisionPkiZone"`). Enrollment then fails closed (task-079). No half-provisioned state was persisted on the record. (Note: an earlier identical attempt briefly succeeded due to a rollout endpoint race — the old good-secret pod served it; re-tested deterministically against the single bad-secret pod.)

**AC#5 (explicit zone):** every pki call passes the zone; fail-closed resolution never auto-picked a zone.

**Cleanup:** the 3 throwaway test domains (ssh-ca-test, ssh-ca-fail, ssh-ca-fail2) were deleted and their zones ARCHIVED on pki.joor.net (zones cannot be deleted, only archived). Left active: default, iotgw-lab, iotgw-production, iotgw-office — the real fleet zones. Code: commit 6752611; credential/wiring: c7e0b8e.
<!-- SECTION:NOTES:END -->
