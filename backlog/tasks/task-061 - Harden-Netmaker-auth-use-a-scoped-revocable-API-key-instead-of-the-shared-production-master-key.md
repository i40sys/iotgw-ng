---
id: TASK-061
title: >-
  Harden Netmaker auth: use a scoped, revocable API key instead of the shared
  production master key
status: To Do
assignee: []
created_date: '2026-06-18 05:01'
labels:
  - security
  - netmaker
  - hardening
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Netmaker (api.netmaker.i40sys.com) is a SHARED PRODUCTION service that also manages other networks, so its MASTER_KEY cannot be rotated by us (would disrupt those networks). The master key leaked via removed Kestra playbook history; rotation isn't an option. The proper mitigation is to stop using the all-powerful master key in OUR consumers and use a SCOPED, REVOCABLE Netmaker API key, so a leak of our credential is limited and independently revocable without touching the production master key.

Consumers to migrate: the netmaker-call edge function (supabase/volumes/functions/netmaker-call/index.ts, NETMAKER_MASTER_KEY from supabase-env / supabase/.env) and the oriolrius.netmaker Ansible collection (ansible/netmaker/.env). A Netmaker admin must mint a scoped API key (POST /api/v1/api_keys) — non-disruptive to existing networks. May require code changes if the API-key auth scheme/header differs from the master key. Local credential-swap mechanics + consumer map: backlog/docs/netmaker-credential-handling.md. Supersedes the rotate-the-master-key item from task-060.06 AC#3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 netmaker-call and the ansible collection authenticate to Netmaker with a scoped API key (not the master key), sourced from secrets/ (SOPS)
- [ ] #2 The scoped key is revocable independently of the production master key; device/network CRUD still works end-to-end
- [ ] #3 decision-014 + netmaker-credential-handling.md updated to reflect the scoped-key approach
<!-- AC:END -->
