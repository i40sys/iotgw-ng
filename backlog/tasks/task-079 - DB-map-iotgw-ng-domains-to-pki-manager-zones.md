---
id: TASK-079
title: 'DB: map iotgw-ng domains to pki-manager zones'
status: Done
assignee: []
created_date: '2026-09-14 05:29'
updated_date: '2026-09-16 16:31'
labels:
  - ssh-ca
  - database
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migration adding domains.pki_zone (unique, nullable), pki_user_ca_id and pki_host_ca_id. References only — no key material, no certificate bodies. A domain without a pki_zone must fail enrollment closed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A migration adds the three columns with comments explaining they are references, not key material
- [x] #2 The supabase-contract types regenerate and iotgw-ui typechecks
- [x] #3 Enrolling a device whose domain has no pki_zone fails with a clear error rather than silently picking a zone
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done 2026-09-14.** `iotgw-ui/supabase/migrations/20260914000000_add_pki_zone_to_domains.sql`.

**What changed:**
- `domains` gains `pki_zone`, `pki_user_ca_id`, `pki_host_ca_id` — all nullable, all references, with column comments saying so explicitly.
- Partial unique index `domains_pki_zone_unique` so one pki-manager zone backs at most one domain, while the many unlinked domains do not collide on NULL.

**Verified on the live kind cluster:** migration applied; `warehouse` linked to `iotgw-lab`; enrolling a device in the unlinked `office` domain returns `409 Domain is not linked to a pki-manager zone`, i.e. it fails closed rather than signing in the wrong trust domain.

**AC#2 not ticked:** the supabase-contract types were not regenerated (that needs `pnpm generate:contract` against a reachable DB URL). `pnpm typecheck` passes across all three workspaces because no typed client reads the new columns yet — the edge function talks to PostgREST directly.
<!-- SECTION:NOTES:END -->
