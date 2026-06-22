---
id: TASK-062.15
title: >-
  TERMINAL: delete all docker-compose files, helper scripts, and the ssh-test
  harness
status: Done
assignee: []
created_date: '2026-06-18 05:43'
updated_date: '2026-06-18 19:59'
labels:
  - migration
  - compose-removal
  - cleanup
dependencies:
  - TASK-062.11
  - TASK-062.13
  - TASK-062.14
  - TASK-062.12
  - TASK-062.01
parent_task_id: TASK-062
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the full stack is validated at parity on kind and the orchestrator/docs are rewired, delete every compose artifact: supabase/docker-compose.yml + docker-compose.s3.yml + dev/docker-compose.dev.yml + reset.sh, kestra/docker-compose.yml, kms/docker-compose.yml, and kms/ssh-test/docker-test/docker-compose.yml + test-ssh-keys.sh. Add a BACKUP/recovery note recording the decommission and where the last compose definitions live (git history). Tidy now-descriptive compose comments in the k8s manifests. Gated on validated parity + the orchestrator/doc rewire + the authorizing decision + the deprecation window.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All listed docker-compose files and compose-coupled scripts (reset.sh, test-ssh-keys.sh) deleted from the tree
- [x] #2 git grep 'docker compose'/'docker-compose' returns only historical ADRs (with forward-notes) and tidy-able manifest comments, no live instructions
- [x] #3 A BACKUP/recovery note records the decommission and points to git history for the removed compose definitions
- [x] #4 'just bootstrap' brings up the full stack on kind with no reference to any deleted file
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. git rm all compose .yml (from deprecated/ staging) + reset.sh + test-ssh-keys.sh + the ssh-test harness + obsolete DOCKER_FIXES.md.\n2. Tidy stale references to the deleted files (kms/README ssh-test section, configmap comment, .gitignore, etc.).\n3. Finalize the BACKUP recovery note; verify git grep clean + bootstrap compose-free.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done — TERMINAL deletion executed (gated on 062.11 parity + 062.13/062.14 rewire + 062.12 staging + 062.01 authorization, all met).

AC#1: deleted all 6 platform compose files (supabase/docker-compose.yml + .s3.yml + dev/docker-compose.dev.yml, kestra/docker-compose.yml, kms/docker-compose.yml, kms/ssh-test/docker-test/docker-compose.yml — via the deprecated/compose staging then git rm) + the compose-coupled scripts supabase/reset.sh and kms/ssh-test/docker-test/test-ssh-keys.sh + the whole kms/ssh-test SSH-test harness + the obsolete kms/DOCKER_FIXES.md. git ls-files confirms no compose artifact remains tracked (the only compose files left on disk are the gitignored BACKUP/ frozen snapshot + a venv dep).
AC#2: git grep 'docker compose'/'docker-compose' over tracked source returns ONLY historical ADRs (backlog/, forward-noted) + decommission forward-notes (CLAUDE.md/README/cluster.yaml/subproject docs) + the stack-operator tombstone + a SOPS provenance comment — NO live instructions. Also tidied every stale reference to the deleted files: removed the ssh-test section from kms/README.md (+ doc-index/prereqs/test-suite), the DOCKER_FIXES.md ref in the kms configmap comment, the ssh-test entries in kms/.gitignore, the reset.sh note in supabase/CLAUDE.md, and a vestigial verify.sh comment; refreshed the stale KMS version table (5.9.0 Docker -> 5.20.0 on kind).
AC#3: BACKUP/COMPOSE-DECOMMISSION-RECOVERY.md records the decommission + every recovery source (git history with recover commands, the deprecation-window staging, BACKUP/git-archives, the frozen snapshot) + the full rollback procedure.
AC#4: 'just bootstrap' = 'kind-up k8s-deploy k8s-smoke' (compose-free); grep confirms neither the justfile nor deploy/kind/bootstrap.sh reference any deleted/compose file; both overlays render (kind/prod). The bootstrap path's steps are individually validated and the live stack was validated e2e (062.11). KNOWN GAP (documented, 062.05): the Kestra flow source + KV are not yet re-seeded by bootstrap (they were API-seeded on the live cluster), so a from-absolute-scratch 'just kind-down && just bootstrap' brings up the full INFRASTRUCTURE but the Kestra flow content needs a seed step — a recommended follow-up, not a compose dependency.
<!-- SECTION:NOTES:END -->
