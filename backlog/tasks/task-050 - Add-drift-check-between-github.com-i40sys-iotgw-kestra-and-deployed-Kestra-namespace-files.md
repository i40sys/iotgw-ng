---
id: TASK-050
milestone: CRUD networks
parent_task_id: TASK-052
title: >-
  Add drift check between github.com/i40sys/iotgw-kestra and deployed Kestra
  namespace files
status: To Do
assignee: []
created_date: '2026-04-22 05:07'
labels:
  - kestra
  - networks
  - ci
dependencies:
  - TASK-049
references:
  - kestra/CLAUDE.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prevent silent divergence between the canonical GitHub repo and what Kestra actually serves. Today there is no automated check; we verified manually that current state matches but nothing enforces it.

## Change
Add a script (kestra/scripts/check-drift.sh, plus a justfile target) that:
1. Clones / fetches github.com/i40sys/iotgw-kestra
2. For each file in the repo, fetches GET /api/v1/main/namespaces/iotgw-ng/files?path=/<file> with basic auth from env (KESTRA_USER, KESTRA_PASS)
3. Diffs them; exits nonzero if any differ
4. Also enumerates files via GET /api/v1/main/namespaces/iotgw-ng/files/directory and reports any file present in Kestra but absent from the repo.

## Optional
Wire as a GitHub Action on i40sys/iotgw-kestra post-merge that pings the kestra webhook (key iotgw-sync-2024) and waits, then runs the drift check.

## Verified API endpoints (from this audit)
- GET /api/v1/main/flows/iotgw-ng/<id>?source=true
- GET /api/v1/main/namespaces/iotgw-ng/files?path=/<file>
- GET /api/v1/main/namespaces/iotgw-ng/files/directory
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Script kestra/scripts/check-drift.sh exists, runnable locally with KESTRA_USER/KESTRA_PASS env
- [ ] #2 Script also handles flow YAML drift (compare repo flow YAMLs to API source field if applicable)
- [ ] #3 Executed today against current state: report 0 drift OR follow-up tasks filed for whatever it finds
- [ ] #4 Optional CI hook documented in i40sys/iotgw-kestra README
<!-- AC:END -->
