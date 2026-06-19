---
id: TASK-062.05
title: Migrate Kestra flow source + KV store into the k8s Postgres
status: Done
assignee: []
created_date: '2026-06-18 05:43'
updated_date: '2026-06-18 19:15'
labels:
  - k8s
  - migration
  - kestra
  - compose-removal
  - data-migration
milestone: Decommission docker-compose
dependencies:
  - TASK-054
parent_task_id: TASK-062
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Flows are the source of truth IN the Kestra Postgres DB, not the filesystem. The k8s StatefulSet uses postgres:16 with a fresh empty PVC while compose uses postgres:18 on disk, so the k8s instance starts with zero flows/history and an empty KV store. Provide a migration path (logical pg_dump/restore PG18->PG16, or rebuild flows from github.com/i40sys/iotgw-kestra via the new runner) and re-seed KV (GITHUB_ACCESS_TOKEN, COSMIAN_KMS_URL, SUPABASE_SERVICE_KEY, SUPABASE_URL).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 k8s Kestra Postgres contains the iotgw-ng namespace flows (via dump/restore or re-sync from github.com/i40sys/iotgw-kestra)
- [x] #2 KV entries GITHUB_ACCESS_TOKEN, COSMIAN_KMS_URL, SUPABASE_SERVICE_KEY, SUPABASE_URL present in the k8s instance
- [x] #3 The sync-namespace-files flow (schedule + GitHub webhook) is re-validated end-to-end under the k8s runner
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Load the migrated PodCreate flows (install/provisioning/connectivity) into the k8s Kestra Postgres.\n2. Seed KV: GITHUB_ACCESS_TOKEN, COSMIAN_KMS_URL, SUPABASE_SERVICE_KEY, SUPABASE_URL (in-cluster URLs, SOPS values).\n3. Re-validate sync-namespace-files end-to-end under the k8s runner.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
[follow-up 2026-06-18] KV value-corruption fix: the original PUTs stored values UNQUOTED, so Kestra 1.3.22 parsed them as Ion and TRUNCATED at the first '.'/':'. Re-set all affected values with a quoted Ion string over text/plain (curl --data-binary '"<value>"'): SUPABASE_URL=http://kong:8000, COSMIAN_KMS_URL=http://cosmian-kms:9998, SUPABASE_SERVICE_KEY=<full 223-char service_role JWT> (was truncated to the 36-char header). GITHUB_ACCESS_TOKEN (hex) was unaffected. All 4 KV values verified correct. NOTE: KV is not re-seeded by bootstrap on a fresh cluster — a reproducible KV-seed step (using quoted values) is a remaining gap.
<!-- SECTION:NOTES:END -->
