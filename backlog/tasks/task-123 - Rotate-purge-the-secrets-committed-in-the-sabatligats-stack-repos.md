---
id: TASK-123
title: Rotate + purge the secrets committed in the sabatligats stack repos
status: To Do
assignee: []
created_date: '2026-09-17 16:01'
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
- [ ] #2 The secrets are removed from the repos and purged from git history
- [ ] #3 Any deploy-time-needed values are injected via env.j2 from a secret store, not committed
<!-- AC:END -->
