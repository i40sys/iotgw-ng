---
id: TASK-068.04
title: >-
  Remove ansible/netmaker/ from the monorepo and resolve the now-empty ansible/
  wrapper
status: Done
assignee: []
created_date: '2026-06-25 14:16'
updated_date: '2026-06-25 14:34'
labels:
  - ansible
  - repo-extraction
  - cleanup
milestone: Extract netmaker collection to its own repo
dependencies:
  - TASK-068.03
references:
  - ansible/netmaker/
  - ansible/CLAUDE.md
parent_task_id: TASK-068
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once the standalone repo is confirmed canonical + superset (068.02) and its CI is live (068.03), delete the in-repo copy — mirroring the `kestra-ansible-reporter` extraction commit (5408797).

**Steps:**
- `git rm -r ansible/netmaker/` (the whole collection tree, including the now-orphaned `.github/workflows/publish-collection.yml`, `justfile`, `.venv` ignore, etc.).
- Decide the fate of the `ansible/` wrapper: it currently holds only this one collection plus `ansible/CLAUDE.md`. Since no other collection is planned in-repo, **remove `ansible/` entirely** (including `ansible/CLAUDE.md`) — OR, if a future in-repo collection is anticipated, keep `ansible/CLAUDE.md` rewritten as a pure pointer. Default: remove the folder.
- Confirm no build/runtime path (justfile recipes, verify.sh, kustomize, edge functions) imports anything from `ansible/`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ansible/netmaker/ is removed from the working tree and git index.
- [x] #2 The ansible/ wrapper folder is resolved per the decision (removed entirely, or kept only as a rewritten pointer CLAUDE.md) — no dangling empty dir, no stale ansible/CLAUDE.md describing an in-repo collection.
- [x] #3 Grep confirms no justfile/verify.sh/kustomize/edge-function path still reads from ansible/.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.** `git rm -r ansible/netmaker` then `rm -rf ansible` (removed the whole wrapper incl. `ansible/CLAUDE.md` and untracked `.venv`). The `ansible/` group had only this one collection and no future in-repo collection is planned, so the folder was removed entirely (no pointer stub).

**Verified no build/runtime dependency:** grep of `justfile` / `tools/` / `deploy/` / `supabase/volumes` for `ansible/` found only the `tools/secrets/secrets.sh` `[netmaker]` render mapping (handled in 068.05). No justfile recipe, kustomize path, or edge-function import reads from `ansible/`.
<!-- SECTION:NOTES:END -->
