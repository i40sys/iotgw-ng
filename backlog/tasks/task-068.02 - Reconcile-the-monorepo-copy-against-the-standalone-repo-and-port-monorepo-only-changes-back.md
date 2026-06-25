---
id: TASK-068.02
title: >-
  Reconcile the monorepo copy against the standalone repo and port monorepo-only
  changes back
status: Done
assignee: []
created_date: '2026-06-25 14:16'
updated_date: '2026-06-25 14:34'
labels:
  - ansible
  - galaxy
  - repo-extraction
milestone: Extract netmaker collection to its own repo
dependencies:
  - TASK-068.01
references:
  - ansible/netmaker/
  - 'https://github.com/oriolrius/netmaker-ansible-automation'
parent_task_id: TASK-068
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The monorepo's `ansible/netmaker/` was consolidated from the standalone repo in late 2025 and **may have diverged** since (e.g. the secrets-remediation notes in `ansible/netmaker/CLAUDE.md` referencing decision-014/task-045, doc tweaks, the "Live vs legacy" banner). Before deleting the in-repo copy we must guarantee the standalone repo loses nothing.

**Steps:**
- Clone `github.com/oriolrius/netmaker-ansible-automation` to a scratch dir and `diff -ru` it against `ansible/netmaker/` (excluding `.venv/`, `__pycache__`, `.env`, build artifacts).
- Enumerate monorepo-only changes; classify each as **port-back** (real improvement: module code, docs, workflow, galaxy/pyproject) vs **monorepo-specific** (don't port: SOPS/secrets-remediation wording that only makes sense inside iotgw-ng, the "Live vs legacy" iotgw-ng banner).
- Open a branch/PR on the standalone repo with the port-back set. If `plugins/`, `galaxy.yml`, `meta/`, or `docs/` changed, **bump the version** (`just bump-version X.Y.Z` — keeps galaxy.yml + pyproject.toml in sync) so a Galaxy release is cut by CI.
- Record the diff summary + the resulting standalone-repo commit/tag in the task notes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A full diff between ansible/netmaker/ (monorepo HEAD) and oriolrius/netmaker-ansible-automation main is captured in the task notes, with every monorepo-only delta classified port-back vs monorepo-specific.
- [x] #2 All port-back deltas are merged into the standalone repo's main; the standalone HEAD is confirmed a superset of the monorepo copy for all shipped paths (plugins/, docs/, meta/, galaxy.yml, pyproject.toml, README, workflow).
- [x] #3 If any shipped code changed, galaxy.yml + pyproject.toml versions are bumped in lockstep and a release is cut; otherwise the notes state explicitly that no version bump was needed.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done — no port-back needed.** Cloned the standalone repo and ran a full `diff -ru` (excluding `.venv`/`__pycache__`/`.env`/build artifacts) against `ansible/netmaker/`.

**Result:** every shipped path is byte-identical — `plugins/modules/netmaker_management.py`, `galaxy.yml`, `pyproject.toml`, `meta/runtime.yml`, `docs/` (both files), `ansible.cfg`, `justfile`, `scripts/bump-version.sh` all `IDENTICAL`.

**Monorepo-only deltas (classified monorepo-specific, NOT ported):**
- `CLAUDE.md` — the "Live vs legacy" banner, the decision-014 secrets-remediation note, and the "CI is DEAD post-consolidation" wording (all iotgw-ng-internal framing).
- `README.md` — swapped generic `docker-compose.yml` Netmaker examples for "external host" wording; iotgw-ng decommissioned compose but generic collection users still run Netmaker via compose, so this does NOT belong upstream.
- empty `roles/` dir — not shippable.

**Conclusion:** the standalone repo HEAD is already a complete superset of all shipped collection code. **No version bump, no Galaxy republish required** (galaxy.yml/pyproject already at 1.0.3, identical). Standalone repo unchanged at commit dfeb0b1 (v1.0.3).
<!-- SECTION:NOTES:END -->
