---
id: TASK-067.16
title: >-
  Post-public secret-exposure incident: literal-secret tripwire leak +
  credential rotations
status: Done
assignee: []
created_date: '2026-06-25 08:07'
updated_date: '2026-06-25 08:07'
labels:
  - security
  - secrets
  - incident
milestone: Container image CI/CD (ghcr.io/i40sys)
dependencies: []
parent_task_id: TASK-067
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PROBLEM: After the i40sys repo was made PUBLIC (to enable code scanning / attestations for the image CI/CD milestone), real secrets became publicly readable and Google Cloud Trust & Safety flagged a live Gemini API key. Two distinct root causes surfaced beyond the original audit (task-067.03):

1) TRIPWIRE-EMBEDDED-SECRETS (the public leak): the secret-hygiene tripwire stored literal secret VALUES as plaintext in TRACKED source — tools/verify.sh greps for them and .gitleaks.toml stop-worded them. On a public repo that file IS the leak. Google found the live Gemini key (project gen-lang-client-0340665082) at .gitleaks.toml and tools/verify.sh.
2) MISSED-LIVE-SECRETS-IN-HISTORY: the live Kestra basic-auth password "The2password." was hardcoded across 9 files in git history (gitleaks missed it — low-entropy dictionary value), and a real OpenRouter key (sk-or-v1-f884...) sat commented in supabase/.env.example. Both were in public history before remediation.

This task records the full incident + remediation (rotate-first, then scrub history, then redesign so no literal secret can live in tracked source again).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Root cause documented: literal secret VALUES were stored in tracked source (tools/verify.sh + .gitleaks.toml), which leaked on the public repo; redesign ensures no literal secret value lives in tracked source.
- [x] #2 Google-flagged Gemini key (KESTRA_GEMINI_API_KEY, project gen-lang-client-0340665082) regenerated at GCP; new value set in secrets/kestra.enc.env, kestra-env Secret refreshed, Kestra rolled; old key purged from history.
- [x] #3 Live Kestra basic-auth password (The2password.) rotated in all 4 SOPS files (kestra/supabase/kestra-reporter/iotgw-ui-backend), k8s Secrets refreshed, consumers rolled, and purged from all history.
- [x] #4 Leaked OpenRouter key (sk-or-v1-f884...) DELETED at openrouter.ai and replaced by a new key (iotgwng-supabase) stored encrypted as supabase OPENAI_API_KEY.
- [x] #5 All leaked/decommissioned literal values purged from FULL git history via git filter-repo and force-pushed to both remotes (gitea + GitHub); full-history gitleaks scan = 0.
- [x] #6 Tripwire redesigned: known-bad values live ENCRYPTED in secrets/decommissioned-secrets.enc.env; verify.sh decrypts at check time; .gitleaks.toml keeps only the *.enc.* allowlist + non-secret regexes (no literal values).
- [x] #7 Rotated credentials stored in Bitwarden (Kestra pw, Gemini key, OpenRouter key); the 3 ghcr packages set public.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rotate-first each live exposed secret (Kestra pw, Gemini key, OpenRouter key) in SOPS + k8s + roll consumers. 2. git filter-repo --replace-text to purge all literal values from full history. 3. Force-push both remotes (lift+restore main branch protection as needed). 4. Redesign the tripwire to a SOPS-encrypted value list; strip literals from verify.sh + .gitleaks.toml. 5. Re-scan to 0; store rotated creds in Bitwarden; make ghcr packages public.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
DONE 2026-06-25. Commits: e9db59c/ae6f635 (Kestra pw rotate+scrub), f0ca5b2/47bff00 (tripwire redesign + 5-value history scrub), 505c843 (Gemini key rotate), 53756d4 (OpenRouter key swap). 
- Kestra pw The2password. -> new 32-char value (sops set x4: kestra KESTRA_BASIC_AUTH_PASSWORD + supabase/kestra-reporter/iotgw-ui-backend KESTRA_PASSWORD); kestra-env+supabase-env refreshed; kestra+iotgw-ui-backend+functions rolled. Stored in Bitwarden 'Kestra WSL2'.
- Gemini key AIzaSyCe-... REGENERATED at GCP by user -> AIzaSyCM... set in secrets/kestra.enc.env (KESTRA_GEMINI_API_KEY); kestra-env refreshed; kestra rolled. Stored in Bitwarden 'Kestra Gemini API key (iotgw-ng dev)'.
- OpenRouter key sk-or-v1-f884... DELETED at openrouter.ai by user; replaced by new iotgwng-supabase key sk-or-v1-8114... as supabase OPENAI_API_KEY (Studio not deployed -> no live consumer). Stored in Bitwarden 'OpenRouter iotgwng-supabase (iotgw-ng)'.
- History scrub: git filter-repo --replace-text removed The2password., AIzaSyCe-..., NBMtSWau..., gHmjTiB5jCB9, 0D8qHlj3DEVL (and earlier sk-or-v1-f884...) from ALL history; force-pushed gitea+GitHub (temporarily DELETE+re-PUT main branch protection to allow the force-push). Safety bundles /tmp/iotgw-ng-pre-pwscrub.bundle + /tmp/iotgw-ng-pre-gcpscrub.bundle. Full-history gitleaks = 0; CI secret-scan green; required check 'gitleaks (full history)' green on HEAD.
- Tripwire redesign: new secrets/decommissioned-secrets.enc.env (SOPS, 5 values); verify.sh section 1 decrypts it at check time (no literals); .gitleaks.toml stopwords removed (only *.enc.* path allowlist + UUID/placeholder regexes remain); verify.sh .env.example check uses generic vendor PREFIXES only.
- ghcr packages iotgw-functions/iotgw-ui-backend/iotgw-ui-frontend set PUBLIC (UI). 
CAVEAT: GitHub may serve old commits (c90cee0/1bceed4) by direct SHA until it GCs unreferenced objects — moot since all keys rotated. LESSON: never store literal secret values in tracked source (tripwire/allowlist must be encrypted or prefix-only).
<!-- SECTION:NOTES:END -->
