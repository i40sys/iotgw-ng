---
id: TASK-108
title: Regenerate the supabase-contract types for the new SSH CA columns
status: To Do
assignee: []
created_date: '2026-09-14 07:09'
updated_date: '2026-09-14 07:35'
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
- [ ] #1 packages/supabase-contract exposes the new domains and devices columns
- [ ] #2 pnpm typecheck passes across all workspaces after regeneration
- [ ] #3 The regenerated file contains no unrelated drift from other pending migrations
<!-- AC:END -->
