---
id: TASK-074
title: 'Resolve decision-028 §9: scope of the pki-manager credential iotgw-ng holds'
status: Done
assignee: []
created_date: '2026-09-14 05:28'
updated_date: '2026-09-17 09:27'
labels:
  - ssh-ca
  - decision
  - security
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-028-ssh-ca-open-security-and-architecture-decisions.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pki-manager has **no per-zone OIDC RBAC** — it is explicitly deferred in that project's decision-017. So the iotgw-ui backend's service account, which needs to create zones/CAs/principals and to call offboard and block, would be **admin over the whole of pki.joor.net**, including every other tenant of that instance. That is more authority than this integration needs, and a compromise of the iotgw-ui backend would reach beyond the iotgw-ng fleet.

Note the asymmetry that already exists and is fine: the `ssh-ca` edge function — the component reachable from the device network — holds only a zone-scoped fleet token that can sign host certs and nothing else. It is the *backend* credential that is over-broad.

**Two options:** (a) pki-manager grows zone-scoped OIDC roles (e.g. `ssh-admin:<zone>`), which is work in that repo and unblocks every future tenant; or (b) iotgw-ng runs its own pki-manager instance, so the blast radius is the iotgw-ng fleet by construction, at the cost of a second deployment, a second KMS and a second set of CAs to look after.

**Where to establish the blast radius:** `GET /api/v1/ssh/zones`, `/hosts`, `/identities` and the X.509 side (`/api/v1/cas`, `/certificates`, `/clusters`) on pki.joor.net show what else lives there. As of 2026-09-14 the SSH side had the `default` zone with 4 hosts (`ovh-ymbihq-node.ymbihq.local`, `c1h1.dev.ymbihq.local`, `web1/web2.acme.example`) plus the `iotgw-lab` pilot — but the X.509 side and the cert-manager external issuer were not enumerated.

**Blocks** the backend zone-provisioning task, which cannot store a credential whose scope is undecided.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The full set of pki.joor.net tenants is enumerated across both the SSH and X.509 surfaces, so the blast radius is a known quantity
- [x] #2 decision-028 §9 records the chosen option and its status flips to DECIDED
- [x] #3 If a shared instance is kept, the backend credential's scope is written down along with what it can reach that it should not
- [x] #4 The credential is stored SOPS-encrypted in secrets/ and just secrets-check passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Decision 2026-09-15 (decision-028 §9):** accept the backend service account GLOBAL admin over pki.joor.net as a documented interim (no per-zone OIDC RBAC upstream). §9 → DECIDED. Exit path: zone-scoped roles or own pki-manager instance.

**AC#4 done 2026-09-16 — dedicated service account created + credential SOPS-stored.**

**What (Keycloak, iam.joor.net, realm `pki-manager`, via the Admin REST API with the realm-master `admin`):**
- Created confidential client **`iotgw-backend`** (`serviceAccountsEnabled=true`, standard/direct/implicit flows OFF) — so the backend uses `client_credentials`, not the human operator login.
- Assigned the realm role **`admin`** to its service-account user (that is the exact role the working operator token carries: `realm_access.roles=['admin',…]`; pki-manager checks it).
- Added an **audience protocol-mapper** (`oidc-audience-mapper`, `included.client.audience=pki-web`) to the client.

**Why the audience mapper (the non-obvious part):** pki-manager validates the token's audience against its own client `pki-web` (config.json → `oidc.clientId=pki-web`). The operator token passes because its `azp=pki-web`; a `client_credentials` token has `azp=iotgw-backend`, so pki-manager returned `401 "Token not intended for this audience"` despite the correct `admin` role. The mapper makes the token carry `aud=["pki-web","account"]` → accepted. Verified: `client_credentials` token → **HTTP 200** on `/api/v1/ssh/zones`.

**How stored:** `secrets/iotgw-ui-backend.enc.env` (SOPS+age) gained `PKI_BASE_URL`, `PKI_OIDC_TOKEN_URL`, `PKI_OIDC_CLIENT_ID`, `PKI_OIDC_CLIENT_SECRET`. `just secrets-check` passes (19 encrypted values, no cleartext leak). Bridged to k8s via `gen_pki_oidc_secret` (bootstrap.sh) → `pki-oidc` Secret. Commit c7e0b8e.

**AC#1 still open:** a FULL enumeration of pki.joor.net tenants across BOTH the SSH and X.509 surfaces. SSH side observed today: zones `default` (CAs acme-users/acme-hosts) + `iotgw-lab`; X.509 side + cert-manager issuer not yet enumerated. AC#2/#3/#4 done.

**AC#1 done 2026-09-16 — pki.joor.net tenants enumerated (blast radius of the backend admin credential).**

**SSH surface (`/api/v1/ssh/*`):**
- Zones (active): `default`, `iotgw-lab` (=iotgw-ng warehouse), `iotgw-production`, `iotgw-office`. The last three are iotgw-ng's own (created/backfilled in task-080). The archived throwaway test zones no longer appear.
- Hosts in `default` (NOT iotgw-ng): `ovh-ymbihq-node.ymbihq.local`, `c1h1.dev.ymbihq.local`, `web1.acme.example`, `web2.acme.example`.
- Identities in `default` (NOT iotgw-ng): `Oriol`, `jane@acme.example`, `alice@acme.example`. (iotgw-ng: `oriol@iotgw-lab`.)

**X.509 surface:** `/api/v1/cas` = 1 CA `CN=pki.ymbihq.local, O=YMBIHQ` (active); `/certificates` = 0; `/clusters` = no endpoint.

**Blast radius (the §9 residual, now quantified):** the iotgw-ng backend's global-admin credential can also create/modify/offboard/revoke everything in the shared `default` SSH zone (the `ymbihq.local` infra hosts + the `acme.example` demo hosts/users) AND the `pki.ymbihq.local` X.509 CA and any certs it issues. That is strictly more than iotgw-ng needs — exactly the over-broad authority §9 accepted as an interim. Exit path unchanged (zone-scoped OIDC roles upstream, or a dedicated iotgw-ng pki-manager instance); revisit before onboarding a sensitive tenant. All 4 ACs now met — task Done.
<!-- SECTION:NOTES:END -->
