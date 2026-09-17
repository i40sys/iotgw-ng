---
id: TASK-123
title: Rotate + purge the secrets committed in the sabatligats stack repos
status: To Do
assignee: []
created_date: '2026-09-17 16:01'
updated_date: '2026-09-17 16:42'
labels:
  - ssh-ca
  - security
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Audit during task-073 (vendoring the docker stacks) found real secrets committed to the PRIVATE sabatligats/* stack repos' history. The public vendor (files/stacks/) excludes them, but they remain live in the source repos and must be rotated + purged.

**Secrets found (gitleaks + manual, 2026-09-17):**
- SSH private key: iotgw_nodered/data/projects/.sshkeys/admin_id_rsa (+ .pub)
- SSH private key: iotgw_vscode/config/.ssh/id_rsa (+ .pub)
- Node-RED credentialSecret: iotgw_nodered/data/settings.js
- code-server login password: iotgw_vscode/.config/code-server/config.yaml
- committed .env (InfluxDB admin token etc.): iotgw_telegraf/local/.env
- OIDC client_secret 9X4K9…: iotgw_alloy(alloy)/etc/obsolete/config.alloy
- uptime-kuma API key uk1_…: iotgw_uptime-kuma/README.md

**To do:** rotate each secret at its source (regenerate keys, new credentialSecret/password, new tokens, revoke the leaked ones), remove them from the repos, and purge from git history (filter-repo/BFG). Then, if runtime seed data is still needed on gateways, inject the rotated values at deploy via env.j2 from a secret store (SOPS in the ansible repo).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each of the 7 secrets is rotated at its source and the old value revoked
- [x] #2 The secrets are removed from the repos and purged from git history
- [ ] #3 Any deploy-time-needed values are injected via env.j2 from a secret store, not committed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Purge DONE 2026-09-17 (AC#2) — all 13 sabatligats stack repos are gitleaks-clean across full history + tags.** Force-pushed rewritten history with the owner (sabatligats) token.

**Method:** per repo — `git filter-repo --strip-blobs-with-ids` (private-key blobs found by content, path-independent — a key blob was reused at multiple paths/renames) + `--replace-text` (every gitleaks-found single-line secret → REDACTED-ROTATE-task123), iterated until gitleaks reports 0, then `push --force refs/heads/* refs/tags/*`.

**Scope was LARGER than the initial HEAD audit (7 → secrets in 7 repos, incl. old commits and TAGS):** iotgw_nodered(3), iotgw_vscode(6), iotgw_telegraf(3), alloy(6), iotgw_uptime-kuma(2, in tag v0.1.0), iotgw_dockge(3), iotgw_glpi-agent(1 — a **GitHub PAT** in tags v1.0.3/4/5). The other 6 repos were already clean. Verified: 13/13 clean on a fresh clone from the remotes.

**STILL OPEN (AC#1 — rotation):** purging git history does NOT invalidate the exposed credentials. Every one of these was committed (and cloned locally during this work) so must be treated as COMPROMISED and ROTATED at its source: the 2 SSH private keys (revoke wherever authorized), the Node-RED credentialSecret, the code-server password, the telegraf InfluxDB admin token, the alloy OIDC client_secret (auth.sabatmorrions.com), the uptime-kuma API key, and the **GitHub PAT** (revoke immediately in GitHub settings). AC#3 (deploy-time injection of any still-needed values via env.j2) also remains.
<!-- SECTION:NOTES:END -->
