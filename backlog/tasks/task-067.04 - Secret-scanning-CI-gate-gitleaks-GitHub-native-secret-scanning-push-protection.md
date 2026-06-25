---
id: TASK-067.04
title: >-
  Secret-scanning CI gate (gitleaks) + GitHub native secret scanning / push
  protection
status: Done
assignee: []
created_date: '2026-06-23 08:01'
updated_date: '2026-06-25 08:32'
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
After the one-time secret-audit (task-067.03), the repo needs a non-bypassable ongoing backstop so no secret can be (re)introduced now that it lives on GitHub. Per the user's explicit preference, the gate is gitleaks (https://github.com/gitleaks/gitleaks): a gitleaks job under .github/workflows/ run on push + pull_request and set as a REQUIRED status check, plus a local pre-commit hook, all reusing the repo-root .gitleaks.toml allowlist from task-067.03 so the SOPS .enc.* ciphertext does not trip it. CORRECTION (2026-06-25): i40sys is a GitHub USER account (not an org), so gitleaks-action is license-free here - the GITLEAKS_LICENSE requirement applies only to GitHub Organizations; use gitleaks-action@v3 or the MIT gitleaks Go binary in a run step (avoid gitleaks-action@v2, Node20 EOL). PREREQUISITE: pushing any .github/workflows/ file requires the i40sys gh token to gain the 'workflow' scope (currently gist,read:org,repo - no workflow).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A workflow at .github/workflows/secret-scan.yml runs gitleaks on push and pull_request, reusing the repo-root .gitleaks.toml allowlist (so secrets/*.enc.* do not trip it) and matching the house style (actions/checkout@v4, named steps, ::error:: annotations).
- [x] #2 The gitleaks step either runs the MIT gitleaks Go binary (v8.30.1, no license — the recommended default) or uses gitleaks/gitleaks-action@v3 with a GITLEAKS_LICENSE secret; the workflow does NOT use gitleaks-action@v2 (Node20 EOL).
- [x] #3 The scan covers full history on PRs (checkout fetch-depth: 0 / --log-opts) and FAILS the job (non-zero exit) when an un-allowlisted secret is detected, and a planted plaintext test secret causes a red check.
- [x] #4 The gitleaks check is configured as a REQUIRED status check for PRs to main once the i40sys repo exists.
- [x] #5 A .pre-commit-config.yaml is added with the gitleaks pre-commit hook pinned to rev v8.30.1 as the local layer-1 gate.
- [x] #6 GitHub native secret scanning AND push protection are enabled (org-wide on i40sys so new repos inherit them), documented as the server-side backstop layer.
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**CORRECTION (2026-06-25, see task-067.16).** The `.gitleaks.toml` authored here
used `stopwords` containing the **literal** decommissioned/leaked secret values
(incl. the live Gemini key) — on the public repo that config file itself became
the leak Google flagged.

**Fixed under task-067.16:** stopwords removed; the known-bad list moved to the
**encrypted** `secrets/decommissioned-secrets.enc.env` which `verify.sh` decrypts
at check time. The gitleaks CI gate + required check + native scanning remain valid.
<!-- SECTION:NOTES:END -->
