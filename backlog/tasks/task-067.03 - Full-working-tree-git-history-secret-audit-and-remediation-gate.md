---
id: TASK-067.03
title: Full working-tree + git-history secret audit and remediation gate
status: In Progress
assignee: []
created_date: '2026-06-23 08:01'
updated_date: '2026-06-25 05:10'
labels:
  - security
  - secrets
  - ci
milestone: Container image CI/CD (ghcr.io/i40sys)
dependencies:
  - TASK-067.02
references:
  - .gitleaks.toml
  - .gitleaksignore
  - secrets/
  - .sops.yaml
  - secrets/supabase.enc.env
  - secrets/traefik-tls.enc.yaml
  - backlog/decisions/decision-014 - Secrets-Management-with-SOPS-and-age.md
parent_task_id: TASK-067
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub exposes the ENTIRE commit history, so before the i40sys migration the whole repo (30 commits, .git ~24M) must be proven free of plaintext secrets across all refs, not just HEAD. Run gitleaks v8.30.1 and trufflehog v3.95.6 over the full history (`--log-opts=--all` / `trufflehog git file://.`) AND the working tree, authoring a .gitleaks.toml that allowlists ONLY the SOPS-encrypted secrets/*.enc.* blobs (by the .enc.* extension, never the secrets/ dir wholesale, so a stray plaintext file there still fails). The SOPS+age model means encrypted ciphertext is safe to publish, but the audit must distinguish that from any plaintext leak. If any real plaintext secret is found in history, follow the rotate-FIRST-then-git-filter-repo runbook (rotation is mandatory because the secret was already on Gitea) and re-scan to zero. This is the hard gate ghcr-setup and secret-scan-ci depend on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A full-history gitleaks v8.30.1 scan (`gitleaks detect --source . --log-opts="--all" --redact -c .gitleaks.toml`) reports zero un-allowlisted findings, and the redacted report is retained as evidence.
- [ ] #2 A full-history trufflehog v3.95.6 scan (`trufflehog git file://. --only-verified --json`) reports zero verified findings, and a working-tree sanity scan (`gitleaks detect --no-git --redact`) is clean.
- [ ] #3 A .gitleaks.toml exists at repo root whose [allowlist] paths match ONLY `.*\.enc\.(env|yaml|yml|json)$` (covering secrets/*.enc.* such as supabase.enc.env, traefik-tls.enc.yaml) and does NOT allowlist secrets/ wholesale; a deliberately planted plaintext test secret in secrets/ still FAILS the scan.
- [ ] #4 It is verified that every secrets/*.enc.* is real AES256_GCM ciphertext (no plaintext sibling) and that the age PRIVATE key (~/.config/sops/age/keys.txt) is absent from both the working tree and full history.
- [ ] #5 If any real plaintext secret is found in history, the rotate-first runbook is executed (credential rotated/re-encrypted via SOPS, then `git filter-repo --invert-paths`/`--replace-text`, gc, force-push) and a re-scan returns zero — documented in the task.
- [ ] #6 Credentials inventoried by backup-removal (the BACKUP/supabase-2025-10-20/.env values) are reconciled into the rotation list and their status (rotated / not-in-use) is recorded.
- [ ] #7 A pre-public-migration checklist is produced confirming steps 1-6 are green as the gate before any push to i40sys.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Author .gitleaks.toml allowlisting only the .enc.* extension; verify a planted plaintext in secrets/ still fails.
2. Run gitleaks v8.30.1 full-history (--log-opts=--all) + working-tree (--no-git) scans; save redacted reports.
3. Run trufflehog v3.95.6 `git file://.` full-history scan with --only-verified; save report.
4. Verify all secrets/*.enc.* are real ciphertext and the age private key is not in tree or history.
5. For any real finding: rotate/revoke at source, re-encrypt via SOPS, rewrite history with git-filter-repo (re-add origin, gc, force-push), and re-scan to zero.
6. Reconcile the backup-removal credential inventory into the rotation list.
7. Produce the green pre-migration checklist as the gate sign-off.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-06-25 (gitleaks-validated audit + LIVE password remediation):
- Authored .gitleaks.toml (extend useDefault) allowlisting ONLY *.enc.* by extension (not secrets/ wholesale) + audited false-positives (YOUR_ANON_KEY, UUID key-IDs) + decommissioned values (verify.sh tripwire set). Planted-secret test (BEGIN PRIVATE KEY in secrets/) correctly FAILS the scan.
- gitleaks v8.30.1 full-history scan triaged 18 findings: 17 = doc/test placeholders + already-decommissioned values tracked by tools/verify.sh; 1 = a real-looking OpenRouter key sk-or-v1-... commented in supabase/.env.example.
- CRITICAL (user-reported): the LIVE Kestra basic-auth password '***REMOVED-ROTATED-KESTRA-PW***' was hardcoded in git HISTORY across 9 files (decision-014, kestra-expert agent, deployments.ts, devices.ts, vpn-totp-manual-test.md, 4x kestra-call edge fns) = 69 blobs. gitleaks missed it (low-entropy dictionary pw).
  ROTATED FIRST: generated a new 32-char value, sops-set into all 4 SOPS files (kestra KESTRA_BASIC_AUTH_PASSWORD; supabase/kestra-reporter/iotgw-ui-backend KESTRA_PASSWORD); refreshed k8s Secrets (kestra-env+supabase-env across kestra/iotgw-ui/supabase-app); rolled kestra + iotgw-ui-backend + functions. New value verified live in all 4 cluster Secrets.
  THEN PURGED: git filter-repo --replace-text removed '***REMOVED-ROTATED-KESTRA-PW***' AND the sk-or-v1 OpenRouter key from ALL history. Safety bundle at /tmp/iotgw-ng-pre-pwscrub.bundle. Full-history gitleaks re-scan = 0 findings.
  PUSHED: force-pushed scrubbed main to gitea (only branch; matches local ae6f635). GitHub origin force-push PENDING the i40sys credential/scope refresh (oriolrius token gets 'Repository not found' on the private i40sys repo; also needs 'workflow' scope to push .github/workflows/*).
- Fixed verify.sh tripwire: 'The2password' -> '***REMOVED-ROTATED-KESTRA-PW***' (real value); added sk-or-v1 to the .env.example tripwire.
STILL TODO: (1) force-push scrubbed history to GitHub i40sys once auth is in place; (2) REVOKE the sk-or-v1 OpenRouter key at openrouter.ai if it was ever real (it was in history before the scrub); (3) reconcile BACKUP/ creds (067.02).
<!-- SECTION:NOTES:END -->
