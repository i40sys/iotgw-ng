---
id: TASK-105
title: >-
  Create the supabase-anon Secret in the kestra namespace so runner pods can
  reach the ssh-ca edge function
status: To Do
assignee: []
created_date: '2026-09-14 07:09'
updated_date: '2026-09-14 07:35'
labels:
  - ssh-ca
  - k8s
  - secrets
  - kestra
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-026-ssh-ca-gateway-provisioning-and-enrollment-sequence.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Blocker for the tasks/ssh_ca.yaml task.** `Flow.yaml` now injects `SUPABASE_ANON_KEY` into the Ansible runner pod via `secretKeyRef: {name: supabase-anon, key: ANON_KEY, optional: true}`, but **nothing creates that Secret**. With `optional: true` the pod starts happily and enrollment then fails at Kong with a 401 — a silent failure mode, which is why this needs its own task rather than a footnote.

The pattern to copy is `gen_kms_auth_secret()` in `deploy/kind/bootstrap.sh`, which already bridges `kms-auth` into both `iotgw-ui` and `kestra` (task-069 did exactly this shape of work). `ANON_KEY` lives in `secrets/supabase.enc.env`.

Decide while doing it whether `optional: true` is right: it keeps a cluster without the Secret bootable, but it converts a missing credential into a runtime 401 instead of a startup error. A preflight check in `tasks/ssh_ca.yaml` that fails fast on an empty `SUPABASE_ANON_KEY` would give the same safety with a better error.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A runner pod spawned by the provisioning flow has a non-empty SUPABASE_ANON_KEY
- [ ] #2 The Secret is generated from the SOPS store by bootstrap.sh, not applied by hand, so a fresh cluster gets it
- [ ] #3 A missing or empty anon key produces a clear, early failure rather than a 401 late in the playbook
<!-- AC:END -->
