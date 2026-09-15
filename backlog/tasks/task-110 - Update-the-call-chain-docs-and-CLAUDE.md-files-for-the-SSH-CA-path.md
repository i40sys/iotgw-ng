---
id: TASK-110
title: Update the call-chain docs and CLAUDE.md files for the SSH CA path
status: To Do
assignee: []
created_date: '2026-09-14 07:09'
updated_date: '2026-09-14 07:35'
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
- [ ] #1 The root CLAUDE.md call chain includes SSH CA enrollment and points at decisions 023-028
- [ ] #2 Every CLAUDE.md that describes a component touched by this migration matches what the code does
- [ ] #3 An operator runbook exists covering: get a certificate, trust a domain's Host CA, renew an expired certificate, and use break-glass
- [ ] #4 No doc still implies authorized_keys is the access mechanism once the migration completes
<!-- AC:END -->
