---
id: TASK-067.04
title: >-
  Secret-scanning CI gate (gitleaks) + GitHub native secret scanning / push
  protection
status: To Do
assignee: []
created_date: '2026-06-23 08:01'
labels:
  - ci
  - security
  - secrets
  - github
milestone: Container image CI/CD (ghcr.io/i40sys)
dependencies:
  - TASK-067.03
references:
  - .github/workflows/secret-scan.yml
  - .gitleaks.toml
  - .pre-commit-config.yaml
  - ansible/netmaker/.github/workflows/publish-collection.yml
  - backlog/decisions/decision-014 - Secrets-Management-with-SOPS-and-age.md
parent_task_id: TASK-067
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the one-time secret-audit, the repo needs a non-bypassable ongoing backstop so no secret can be (re)introduced once it is public on i40sys. Add a gitleaks CI job under .github/workflows/ as a required status check on PRs and a local pre-commit hook for fast feedback, then enable GitHub native secret scanning + push protection org-wide on i40sys. Because i40sys is a GitHub ORG, gitleaks-action@v2 is unavailable (Node20 EOL 2026-09-16) and the v3 action requires a free GITLEAKS_LICENSE — so the recommended default is running the MIT gitleaks Go binary directly in a run step (no license, any visibility); gitleaks-action@v3 with a provisioned GITLEAKS_LICENSE secret is the documented alternative. The CI job must reuse the .gitleaks.toml allowlist from secret-audit so the SOPS .enc.* blobs do not trip it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A workflow at .github/workflows/secret-scan.yml runs gitleaks on push and pull_request, reusing the repo-root .gitleaks.toml allowlist (so secrets/*.enc.* do not trip it) and matching the house style (actions/checkout@v4, named steps, ::error:: annotations).
- [ ] #2 The gitleaks step either runs the MIT gitleaks Go binary (v8.30.1, no license — the recommended default) or uses gitleaks/gitleaks-action@v3 with a GITLEAKS_LICENSE secret; the workflow does NOT use gitleaks-action@v2 (Node20 EOL).
- [ ] #3 The scan covers full history on PRs (checkout fetch-depth: 0 / --log-opts) and FAILS the job (non-zero exit) when an un-allowlisted secret is detected, and a planted plaintext test secret causes a red check.
- [ ] #4 The gitleaks check is configured as a REQUIRED status check for PRs to main once the i40sys repo exists.
- [ ] #5 A .pre-commit-config.yaml is added with the gitleaks pre-commit hook pinned to rev v8.30.1 as the local layer-1 gate.
- [ ] #6 GitHub native secret scanning AND push protection are enabled (org-wide on i40sys so new repos inherit them), documented as the server-side backstop layer.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create .github/workflows/secret-scan.yml running gitleaks (MIT binary v8.30.1 by default) on push + pull_request with fetch-depth: 0 and -c .gitleaks.toml.
2. Wire ::error:: annotations and ensure a non-zero exit fails the job; test with a planted secret.
3. Add .pre-commit-config.yaml with the gitleaks hook pinned to v8.30.1.
4. After the i40sys repo exists, set the gitleaks check as a required status check on main.
5. Enable GitHub native secret scanning + push protection org-wide on i40sys.
6. Document the 3-layer defense (pre-commit, CI gate, push protection) in the runbook.
<!-- SECTION:PLAN:END -->
