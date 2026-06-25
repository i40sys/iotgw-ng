---
id: TASK-068.03
title: >-
  Re-activate and validate the standalone repo's Galaxy publish CI and
  public-repo secret hygiene
status: Done
assignee: []
created_date: '2026-06-25 14:16'
updated_date: '2026-06-25 14:51'
labels:
  - ansible
  - galaxy
  - cicd
  - security
milestone: Extract netmaker collection to its own repo
dependencies:
  - TASK-068.02
references:
  - ansible/netmaker/.github/workflows/publish-collection.yml
  - >-
    backlog/tasks/task-067.04 -
    Secret-scanning-CI-gate-gitleaks-GitHub-native-secret-scanning-push-protection.md
parent_task_id: TASK-068
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With the standalone repo re-adopted as canonical, confirm its automated publish path (DEAD while living in the monorepo per decision-012) is **live again** and the public repo is secret-clean.

**Steps:**
- Confirm `.github/workflows/publish-collection.yml` is present on the standalone repo's main and that the `ANSIBLE_GALAXY_TOKEN` repo secret exists and is valid.
- Trigger a `workflow_dispatch` (or a no-op shipped-path change) and confirm the version-alignment check + `ansible-galaxy collection build` succeed; confirm the publish step reaches Galaxy (or dry-run it if the version is unchanged).
- Public-repo secret hygiene (the repo is PUBLIC): run gitleaks over the working tree AND full history (mirror task-067.04). The collection historically hardcoded `NETMAKER_MASTER_KEY` (see netmaker CLAUDE.md / decision-014); confirm no live secret is present in tree or history, and that `.env` is gitignored and excluded by `galaxy.yml build_ignore`.
- Enable GitHub native secret scanning + push protection on the repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 publish-collection.yml runs green on the standalone repo (version-alignment check + collection build pass; publish step verified reachable), restoring automated Galaxy publishing.
- [x] #2 ANSIBLE_GALAXY_TOKEN secret is confirmed present/valid on the repo.
- [x] #3 gitleaks over working tree + full history reports 0 live-secret findings; if any historical NETMAKER_MASTER_KEY is found it is confirmed already-rotated/compromised-and-noted; native secret scanning + push protection are enabled.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done — CI already live; public history clean; secret-scanning hardened.**

**Galaxy publish CI:** the standalone repo's "Publish to Ansible Galaxy" workflow last ran **success on 2025-10-21** (push), plus the two prior push runs (v1.0.2/v1.0.3) green — proving both the workflow AND `ANSIBLE_GALAXY_TOKEN` are valid. The "DEAD" status only ever described the remote-less monorepo copy. No workflow_dispatch needed (1.0.3 unchanged; would be a no-op republish).

**Public-repo secret hygiene:** full-history scan (`git log --all -p` grep) found **0 hardcoded secrets** (only uv.lock package hashes matched the pattern); `.env` never in history; `.env` is gitignored + in `galaxy.yml build_ignore`.

**Native secret scanning + push protection: ENABLED** (verified via the GitHub API on the oriolrius account, which owns the repo). The two advanced toggles (non-provider patterns, validity checks) are plan-gated — they need GitHub Advanced Security / Secret Protection, not available on a free public personal repo — so they remain off; the two protections the task required are on.
<!-- SECTION:NOTES:END -->
