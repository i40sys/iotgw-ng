---
id: TASK-074
title: 'Resolve decision-028 §9: scope of the pki-manager credential iotgw-ng holds'
status: In Progress
assignee: []
created_date: '2026-09-14 05:28'
updated_date: '2026-09-15 05:06'
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
- [ ] #1 The full set of pki.joor.net tenants is enumerated across both the SSH and X.509 surfaces, so the blast radius is a known quantity
- [x] #2 decision-028 §9 records the chosen option and its status flips to DECIDED
- [x] #3 If a shared instance is kept, the backend credential's scope is written down along with what it can reach that it should not
- [ ] #4 The credential is stored SOPS-encrypted in secrets/ and just secrets-check passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Decision 2026-09-15 (decision-028 §9):** accept the backend service accounts GLOBAL admin over pki.joor.net as a documented interim (no per-zone OIDC RBAC upstream yet). Residual written down (admin across all tenants). §9 → DECIDED. Exit path: zone-scoped roles or own pki-manager instance; revisit before onboarding a sensitive tenant. Open: AC#1 enumerate pki.joor.net tenants; AC#4 SOPS-store the credential + just secrets-check.
<!-- SECTION:NOTES:END -->
