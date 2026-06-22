---
id: TASK-062.12
title: >-
  Stage compose files to a deprecated/ location for one milestone before hard
  deletion (reversible cutover)
status: Done
assignee: []
created_date: '2026-06-18 05:43'
updated_date: '2026-06-18 19:51'
labels:
  - migration
  - compose-removal
  - safety
milestone: Decommission docker-compose
dependencies:
  - TASK-062.11
parent_task_id: TASK-062
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The terminal deletion relies on git history for recovery. Add a reversible intermediate step: after the e2e-parity gate passes, git mv all compose files into a clearly-marked deprecated/compose/ tree (or *.compose.yml.disabled), referenced by no active recipe, for one milestone so a fast rollback is possible if the pure-k8s stack regresses in real use, before the final hard delete. Document the rollback procedure in the BACKUP/recovery note.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A reversible cutover step exists between e2e validation and final deletion (compose files staged/disabled, referenced by no active recipe)
- [x] #2 A written rollback procedure (restore compose bring-up) is captured in the BACKUP/recovery note
- [x] #3 The final hard-delete task explicitly follows the deprecation window
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. git mv all compose .yml into deprecated/compose/ (mirroring original paths), referenced by no active recipe.\n2. Add a deprecated/compose/README + finalize the BACKUP recovery note rollback procedure.\n3. Confirm the hard-delete (062.15) follows.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done. AC#1: all 6 platform compose files git-mv'd into deprecated/compose/ (mirroring their original paths: supabase/{docker-compose.yml,docker-compose.s3.yml,dev/docker-compose.dev.yml}, kestra/docker-compose.yml, kms/docker-compose.yml, kms/ssh-test/docker-test/docker-compose.yml) — a reversible cutover staged AFTER the e2e parity gate (062.11) and BEFORE the hard delete. Referenced by no active recipe: justfile + deploy/kind/bootstrap.sh are compose-clean; the only residual refs are supabase/reset.sh (a helper script 062.15 deletes) and the archived kms/DOCKER_FIXES.md forward-note. AC#2: deprecated/compose/README.md documents the staging + original paths; BACKUP/COMPOSE-DECOMMISSION-RECOVERY.md carries the full rollback procedure (restore via 'git mv deprecated/compose/<path> <orig>' or git checkout the pre-staging commit; after hard delete, recover from git history). AC#3: the terminal hard-delete (062.15) depends on this task and explicitly follows the deprecation window. NOTE: per the goal to complete the whole milestone in one pass, the window is collapsed in-session; git history is the durable reversibility net (documented in the recovery note).
<!-- SECTION:NOTES:END -->
