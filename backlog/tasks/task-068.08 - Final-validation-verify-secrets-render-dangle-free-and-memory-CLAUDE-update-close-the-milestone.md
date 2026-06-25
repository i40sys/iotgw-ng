---
id: TASK-068.08
title: >-
  Final validation (verify/secrets-render dangle-free) and memory/CLAUDE update;
  close the milestone
status: Done
assignee: []
created_date: '2026-06-25 14:17'
updated_date: '2026-06-25 14:35'
labels:
  - validation
  - docs
milestone: Extract netmaker collection to its own repo
dependencies:
  - TASK-068.05
  - TASK-068.06
  - TASK-068.07
references:
  - tools/verify.sh
parent_task_id: TASK-068
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gate the milestone closed only after the repo is provably dangle-free and the project memory reflects the new topology.

**Steps:**
- Run `just secrets-render` and confirm it no longer writes/expects `ansible/netmaker/.env` and exits clean.
- Run `just verify` (secret hygiene, SOPS round-trip, kustomize render, ui typecheck+tests, kind smoke) and confirm green — no path now resolves into `ansible/`.
- Final `git grep` sweep: confirm zero live in-repo references to the removed collection (only intentional historical records remain).
- Update CLAUDE memory: add a memory noting the collection was re-externalized to `github.com/oriolrius/netmaker-ansible-automation` (canonical, Galaxy `oriolrius.netmaker`), cross-link the kestra-ansible-reporter extraction and decision-022, and refresh MEMORY.md index.
- Verify the epic's acceptance criteria, mark all subtasks + the epic Done.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 just secrets-render and just verify both run clean with no reference resolving into ansible/ ; output captured in notes.
- [x] #2 Final git grep shows no live in-repo path references to the removed collection.
- [x] #3 A CLAUDE memory entry records the re-externalization (canonical repo + Galaxy namespace + decision-022 link) and MEMORY.md is updated; epic TASK-068 and all subtasks are marked Done.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.**
- `just secrets-render` → renders only `iotgw-ui-backend` + `iotgw-ui-root`; **no `ansible/netmaker/.env`**; exit 0.
- `just secrets-check` → all 7 remaining `*.enc.*` round-trip; `netmaker.enc.env` no longer listed; no LEAK lines; exit 0.
- `just verify` → PASS on every check my work touches: SOPS round-trip, **both** kustomize overlays (kind 46 obj / prod 40 obj), iotgw-ui typecheck + vitest, and the full kind smoke (KMS, Kestra, GoTrue, PostgREST, edge fns, **netmaker-call dispatch → 400**, pg_net device+network webhooks fire, ingress front+back).
- **Pre-existing, unrelated failure:** verify step 1 (decommissioned-secret tripwire) reports 3 hits, all in `task-067.03`/`task-067.16` records — confirmed present on a clean tree (changes stashed) and untouched by this session. Not a task-068 regression; belongs to the task-067 secret-incident writeups.
- Final `git grep` shows no live in-repo path references to the removed collection.
- Memory: added `netmaker-collection-externalized.md` + MEMORY.md index line.
<!-- SECTION:NOTES:END -->
