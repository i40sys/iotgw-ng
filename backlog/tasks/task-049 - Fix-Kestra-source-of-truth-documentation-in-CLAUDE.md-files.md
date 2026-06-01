---
id: TASK-049
milestone: CRUD networks
parent_task_id: TASK-052
title: Fix Kestra source-of-truth documentation in CLAUDE.md files
status: To Do
assignee: []
created_date: '2026-04-22 05:07'
labels:
  - docs
  - kestra
dependencies: []
references:
  - kestra/CLAUDE.md
  - kestra/data/main/iotgw-ng/_files/CLAUDE.md
  - /home/oriol/iotgw-ng/CLAUDE.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
kestra/CLAUDE.md and root CLAUDE.md state that data/main/iotgw-ng/_files/ is 'the actual flow and playbook sources'. This is FALSE for Kestra >= 0.15 (we are on v1.3.13 OSS).

## Verified by drift test
- Write file via API (POST /api/v1/main/namespaces/iotgw-ng/files): visible to API and Kestra runtime, also appears on disk.
- Write file directly on disk inside container: HTTP 404 from API, NOT seen by runtime, NOT in directory listing.
- Conclusion: Kestra indexes namespace files in PostgreSQL (repository.type: postgres). The filesystem is a side-effect of API writes by the local-storage driver, NOT an input.

## Real source of truth
- GitHub repo i40sys/iotgw-kestra is the canonical source.
- Deployed by the iotgw-ng/sync-namespace-files flow (uses io.kestra.plugin.git.SyncNamespaceFiles which calls the API).
- Flow YAML lives only in PostgreSQL — fetch with GET /api/v1/main/flows/<ns>/<flow>?source=true.
- The .v4 .. .v19 suffixes on disk are local-storage versioning artifacts, not git history.
- Kestra version: v1.3.13 (latest stable). There is no v2.0 — the breaking change you remember is most likely v0.15 (namespace files moved to internal storage) or the v1.0 milestone (early 2026).

## Files to edit
- kestra/CLAUDE.md
- kestra/data/main/iotgw-ng/_files/CLAUDE.md
- /home/oriol/iotgw-ng/CLAUDE.md (the 'Kestra flows triggered from upstream' table caption / subprojects table)
- supabase/volumes/functions/CLAUDE.md (any references to flow files on disk)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 kestra/CLAUDE.md no longer claims _files/ is the source; explains the API-vs-disk model and points at the GitHub repo
- [ ] #2 kestra/data/main/iotgw-ng/_files/CLAUDE.md updated similarly
- [ ] #3 Root /home/oriol/iotgw-ng/CLAUDE.md updated where it references _files/ as source
- [ ] #4 Includes a one-line 'how to edit a playbook' recipe pointing at the GitHub repo + /sync-kestra skill
- [ ] #5 States current Kestra version (v1.3.13) and clarifies there is no v2
<!-- AC:END -->
