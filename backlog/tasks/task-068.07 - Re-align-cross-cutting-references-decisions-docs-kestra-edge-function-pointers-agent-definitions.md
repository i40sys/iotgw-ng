---
id: TASK-068.07
title: >-
  Re-align cross-cutting references: decisions, docs, kestra/edge-function
  pointers, agent definitions
status: Done
assignee: []
created_date: '2026-06-25 14:17'
updated_date: '2026-06-25 14:35'
labels:
  - docs
  - repo-extraction
milestone: Extract netmaker collection to its own repo
dependencies:
  - TASK-068.04
references:
  - >-
    backlog/decisions/decision-012 -
    Workspace-Git-Consolidation-into-a-Single-Root-Repository.md
  - >-
    backlog/decisions/decision-013 -
    Monorepo-Organization-Single-Repo-with-Logical-Grouping.md
  - backlog/docs/doc-016 - Kestra-Notification-Automation-Pattern.md
  - kestra/CLAUDE.md
  - supabase/volumes/functions/netmaker-call/CLAUDE.md
  - .claude/agents/supabase-function-developer.md
  - .claude/agents/docs-writer-codex.md
  - .github/workflows/build-image.yml
parent_task_id: TASK-068
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sweep every remaining tracked reference to `ansible/netmaker` / `oriolrius.netmaker` / `netmaker_management` and align it. Re-run `git grep -nE "ansible/netmaker|oriolrius\.netmaker|netmaker_management|netmaker-ansible-automation"` as the authoritative checklist.

**Targets (from the current grep):**
- `decision-012` & `decision-013`: these are historical records — do NOT rewrite history; add a clearly-marked forward-pointer note that the "mislocated CI" open-question is resolved by `decision-022` (the actual ADR edit is in 068.01; here just ensure the cross-links land).
- `doc-016` (Kestra notification/automation pattern): correct any `ansible/netmaker/` path reference to the external repo/Galaxy.
- `kestra/CLAUDE.md` (line ~36): `oriolrius.netmaker` collection "(see `ansible/netmaker/`)" → point to Galaxy + external repo; the runtime install-by-FQCN statement stays true.
- `supabase/volumes/functions/netmaker-call/index.ts` (lines ~60/289) and `netmaker-call/CLAUDE.md` (line ~83): the comments call this collection the "reference spec" for the edge function — repoint those to the external repo URL so the contract is still findable after removal.
- Agent definitions `.claude/agents/supabase-function-developer.md` and `.claude/agents/docs-writer-codex.md`: update wording that points at the in-repo collection.
- `.github/workflows/build-image.yml`: check the netmaker reference is only an incidental path filter / comment and correct or drop it.
- `task-067` family references are historical task records — leave as-is (do not rewrite closed tasks).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 git grep for ansible/netmaker / oriolrius.netmaker / netmaker_management / netmaker-ansible-automation returns only: (a) historical task/ADR records left intentionally, each verified correct, and (b) external-repo/Galaxy pointers — no live in-repo path claims.
- [x] #2 decision-012 and decision-013 carry a forward-pointer to decision-022; doc-016, kestra/CLAUDE.md, the netmaker-call index.ts + CLAUDE.md 'reference spec' pointers, and the two agent definitions point to github.com/oriolrius/netmaker-ansible-automation (+ Galaxy).
- [x] #3 .github/workflows/build-image.yml's netmaker reference is verified harmless or corrected.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.** Swept every tracked reference via `git grep`. Edits:
- `kestra/CLAUDE.md` — collection now installed from Galaxy by FQCN; source = external repo (decision-022).
- `netmaker-call/index.ts` (2 comments) + `netmaker-call/CLAUDE.md` — "reference spec" pointers now cite `github.com/oriolrius/netmaker-ansible-automation`.
- `.claude/agents/supabase-function-developer.md` + `docs-writer-codex.md` — repointed (the latter's subproject list dropped the `ansible/netmaker/` bullet).
- `.github/workflows/build-image.yml` — house-style comment repointed to the external repo (verified the reference is just a comment, harmless).
- `doc-016` references list — link repointed to the external repo + decision-022.
- `decision-012` (Q2) and `decision-013` (answer 2) — forward-pointer "Resolved" notes added; history preserved, not rewritten.

**Final grep:** remaining hits are only (a) external-repo/Galaxy pointers, (b) historical task-067/ADR records (intentional), and (c) "was removed"-style explanations. No live in-repo path claims.
<!-- SECTION:NOTES:END -->
