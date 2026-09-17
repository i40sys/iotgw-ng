---
id: TASK-110
title: Update the call-chain docs and CLAUDE.md files for the SSH CA path
status: Done
assignee: []
created_date: '2026-09-14 07:09'
updated_date: '2026-09-17 08:52'
labels:
  - ssh-ca
  - documentation
milestone: m-1
dependencies:
  - TASK-100
references:
  - >-
    backlog/decisions/decision-024-ssh-ca-target-architecture-iotgw-ng-consumes-pki-manager-one-zone-per-domain.md
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The SSH CA path is not in any of the documents an agent or a new contributor reads first, so the next person will re-derive it or contradict it.

**What is stale or missing:**
- root `CLAUDE.md` — "The Real Call Chain" describes device/network provisioning and the KMS SSH-key path but says nothing about SSH CA enrollment or the `ssh-ca` edge function; the "Critical Validated Docs" table should list decisions 023-028.
- `supabase/volumes/functions/CLAUDE.md` — the function table has no `ssh-ca` row and no `_shared/` note; the `vpn` row does not mention `with_ssh_ca`.
- `kestra/CLAUDE.md` — the flow table and the "what the flows do" text predate `tasks/ssh_ca.yaml`.
- `iotgw-ui/apps/backend/CLAUDE.md` — describes the Cosmian KMS SSH-key integration as the SSH story; it now needs to say how that relates to (and differs from) certificate-based access.
- `deploy/README.md` — the new `PKI_BASE_URL` / `PKI_FLEET_TOKENS` env on the functions Deployment.

Also record the operator-facing runbook that does not exist anywhere yet: how an operator gets a certificate, trusts a domain's Host CA, and what to do when a certificate expires.

**Do this last**, once the UNRESOLVED decisions in decision-028 are closed — documenting a design that is still moving is how the current stale docs happened.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The root CLAUDE.md call chain includes SSH CA enrollment and points at decisions 023-028
- [x] #2 Every CLAUDE.md that describes a component touched by this migration matches what the code does
- [x] #3 An operator runbook exists covering: get a certificate, trust a domain's Host CA, renew an expired certificate, and use break-glass
- [x] #4 No doc still implies authorized_keys is the access mechanism once the migration completes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done 2026-09-16.** Documented the SSH-CA path across the docs an agent/contributor reads first, matching the code as verified this session (tasks 089/093/080/074/108).

**AC#1** — root `CLAUDE.md`: new "The SSH-CA Access Path" section (zone-per-domain, `ssh-ca` edge fn as the only device↔pki-manager bridge, enrollment via `tasks/ssh_ca.yaml`, operator trust/user-cert, connectivity-check verify) + the "Critical Validated Docs" table now points at `decision-023..028`.

**AC#2** — component docs updated to match the code:
- `supabase/volumes/functions/CLAUDE.md`: `ssh-ca` row (trust/enroll, fleet token) + a `_shared/` note (device-auth TOTP envelope + pki-manager client, shared with `vpn`).
- `kestra/CLAUDE.md`: `tasks/ssh_ca.yaml` enrollment, connectivity-check host-cert verify (task-093), the `curl`-absent runner-image caveat.
- `iotgw-ui/apps/backend/CLAUDE.md`: new "pki-manager Integration (SSH certificates)" section distinguishing the KMS break-glass key from `services/pki.ts` zone provisioning (task-080).
- `deploy/README.md`: SSH-CA env row (functions `PKI_BASE_URL`/`PKI_FLEET_TOKENS`; backend `PKI_OIDC_*` + the `pki-oidc` Secret).

**AC#3** — new operator runbook `scripts/ssh-ca/README.md`: trust a domain's Host CA (`trust.sh`), get a user certificate (`user-cert.sh`, own OIDC JWT, 24 h), renew (re-run; gateway host cert is 90 d idempotent-renew, task-104), break-glass (50-/60- drop-in ordering).

**AC#4** — every remaining `authorized_keys` mention frames it as break-glass/transitional (moving FROM authorized_keys TO certificates, kept alongside "never as the primary"), not the access mechanism.
<!-- SECTION:NOTES:END -->
