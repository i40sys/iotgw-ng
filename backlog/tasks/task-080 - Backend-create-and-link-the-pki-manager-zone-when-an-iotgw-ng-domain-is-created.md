---
id: TASK-080
title: >-
  Backend: create and link the pki-manager zone when an iotgw-ng domain is
  created
status: In Progress
assignee: []
created_date: '2026-09-14 05:29'
updated_date: '2026-09-16 16:31'
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
- [ ] #2 Re-running against an already-linked domain is a no-op, and against a partially-provisioned zone it completes the missing pieces rather than duplicating
- [ ] #3 The three pre-existing domains can be backfilled, including warehouse whose zone was linked by hand and is named iotgw-lab
- [ ] #4 A pki-manager failure surfaces on the domain record rather than leaving silent partial state
- [ ] #5 Every call passes the zone explicitly, so fail-closed resolution never picks a zone for us
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**In progress 2026-09-16 — backend client implemented + typechecked; live AC proof pending a credential + external-write sign-off.**

**Implemented (commit 6752611):**
- `apps/backend/src/services/pki.ts` — pki-manager ADMIN client. OIDC bearer via `client_credentials` (preferred: a dedicated service account) OR `password`/ROPC (interim operator cred, decision-028 §9), token cached. Idempotent + resumable `ensureDomainPkiZone`: `getZone`→`ensureZone` (POST /ssh/zones), `ensureCa` user+host (GET /ssh/cas filtered by zoneId+caType, else POST), `ensurePrincipal` iotgw-admin/iotgw-ops. Every call passes the zone explicitly (AC#5). Reuses a hand-linked zone verbatim when `existingZone` is set (AC#3 warehouse=iotgw-lab). Also `offboardHost` for task-081.
- `apps/backend/src/routers/domains.ts` — `createDomain` calls it best-effort (a PKI failure leaves the domain UNLINKED so enrollment fails closed, mirroring the KMS-key pattern; partial state persisted → resumable, AC#4) + a new `provisionPkiZone` mutation for backfill/retry that SURFACES errors.
- API contract pinned from pki.joor.net OpenAPI: POST /ssh/zones {name*,displayName?,description?}; POST /ssh/cas {caType*(user|host),label?,zone?}; POST /ssh/principals {name*,zone?,description?}; bearerAuth. Zone id can be a slug ("default") or uuid; CAs carry {id,zoneId,caType,status}; `domains.pki_*_ca_id` = the CA `id`.
- Detection logic validated READ-ONLY against iotgw-lab: zone found, user CA 515ce7b1 + host CA f3a2fbda (match the DB), both principals present → a warehouse re-run is a pure no-op (AC#2/#5 exercised without any write).

**Blocked for AC#1/#3/#4 live proof (needs user):**
1. **Credential (task-074 AC#4):** which OIDC identity the backend uses — a dedicated Keycloak service account (client_credentials) vs the interim operator ROPC (Bitwarden `pki.joor.net`, client `pki-web`, iam.joor.net/realms/pki-manager). Then store PKI_BASE_URL + PKI_OIDC_TOKEN_URL + PKI_OIDC_CLIENT_ID + the grant secret in `secrets/` (SOPS) and inject into the backend Deployment.
2. **External-write sign-off:** running provisionPkiZone against pki.joor.net CREATES real zones/CAs/principals that CANNOT be deleted (only archived). Backfilling `production`/`office` (AC#3) is a permanent-ish side effect on the shared instance.
<!-- SECTION:NOTES:END -->
