---
id: TASK-108
title: Regenerate the supabase-contract types for the new SSH CA columns
status: Done
assignee: []
created_date: '2026-09-14 07:09'
updated_date: '2026-09-16 16:31'
labels:
  - ssh-ca
  - database
  - backend
milestone: m-1
dependencies:
  - TASK-079
  - TASK-082
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The two SSH CA migrations added columns to `domains` (`pki_zone`, `pki_user_ca_id`, `pki_host_ca_id`) and `devices` (`ssh_host_id`, `ssh_host_fqdn`, `ssh_host_key_fingerprint`, `ssh_host_cert_serial`, `ssh_host_cert_valid_before`, `ssh_ca_enrolled_at`), but `packages/supabase-contract` was **not** regenerated (`pnpm generate:contract` needs a reachable `DATABASE_URL`).

`pnpm typecheck` passes today only because nothing typed reads those columns yet — the `ssh-ca` edge function talks to PostgREST directly and is not covered by the contract. The moment the backend task adds `getSshCertStatus`, it will need them.

So this is a prerequisite for the backend tRPC work, not a tidy-up.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 packages/supabase-contract exposes the new domains and devices columns
- [x] #2 pnpm typecheck passes across all workspaces after regeneration
- [x] #3 The regenerated file contains no unrelated drift from other pending migrations
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done 2026-09-16.** Regenerated `packages/supabase-contract/src/database.types.ts` from the LIVE self-hosted DB (StackGres primary via 127.0.0.1:5432, `sslmode=disable`) and rebuilt with tsdown.

**What changed:**
- `domains` now typed with `pki_zone`, `pki_user_ca_id`, `pki_host_ca_id`; `devices` with `ssh_host_id`, `ssh_host_fqdn`, `ssh_host_key_fingerprint`, `ssh_host_cert_serial`, `ssh_host_cert_valid_before`, `ssh_ca_enrolled_at` (18 refs).
- `pnpm typecheck` passes across all three workspaces (AC#2) — this also unblocked task-080's typed access and closes task-079 AC#2.

**AC#3 (no unrelated migration drift):** the only non-SSH-CA changes vs the prior file are the self-hosted DB's EXTENSION objects (`dblink`, `pg_stat_statements*`) that live in `public`, plus the newer `supabase gen types` CLI's helper-type syntax. These are environment/tooling artifacts, NOT columns from other pending migrations — so AC#3 (drift from pending migrations) holds. The prior file was generated via `generate:saas` against the managed project (which lacks those extensions); the self-hosted DB is now the source of truth. Per the package convention, `database.types.ts` was regenerated, not hand-edited.

Committed 6752611.
<!-- SECTION:NOTES:END -->
