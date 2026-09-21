---
id: TASK-105
title: >-
  Create the supabase-anon Secret in the kestra namespace so runner pods can
  reach the ssh-ca edge function
status: Done
assignee: []
created_date: '2026-09-14 07:09'
updated_date: '2026-09-21 05:32'
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
- [x] #1 A runner pod spawned by the provisioning flow has a non-empty SUPABASE_ANON_KEY
- [x] #2 The Secret is generated from the SOPS store by bootstrap.sh, not applied by hand, so a fresh cluster gets it
- [x] #3 A missing or empty anon key produces a clear, early failure rather than a 401 late in the playbook
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done alongside task-106 (shared Flow.yaml change).

**AC#2 (Secret from SOPS by bootstrap.sh):** added gen_supabase_anon_secret() to deploy/kind/bootstrap.sh (commit 230d776) — bridges ANON_KEY from secrets/supabase.enc.env (SOPS) into a narrow single-key `supabase-anon` Secret in the kestra namespace, registered in the apply-secrets block after gen_pki_oidc_secret. Mirrors gen_kms_auth_secret (task-069). So a fresh cluster gets it.

**Flow wiring (i40sys/iotgw-kestra Flow.yaml, commit 583390f):** the runner pod mounts SUPABASE_ANON_KEY via `secretKeyRef: {name: supabase-anon, key: ANON_KEY, optional: true}` and passes it to the playbook as `-e supabase_anon_key="$SUPABASE_ANON_KEY"`. tasks/ssh_ca.yaml already sends it as `Authorization: Bearer` when defined.

**AC#3 (early clear failure, not a late 401):** chose the preflight approach the task suggested. `optional: true` keeps a cluster WITHOUT the Secret bootable for non-ssh_ca provisions; a bash preflight in Flow.yaml fails fast BEFORE ansible-playbook when the ssh_ca path will run (full playbook or explicit ssh_ca tag) but SUPABASE_ANON_KEY is empty, with a clear message pointing at the missing Secret — instead of 401-ing at Kong deep in enrollment. Verified present in the live flow rev 2 (kestra-expert B4).

**AC#1 (runner pod has non-empty SUPABASE_ANON_KEY):** created the supabase-anon Secret live in the kestra namespace (212-char JWT). Proven with a busybox probe pod using the flow's IDENTICAL secretKeyRef → env resolved non-empty (len=212, JWT prefix eyJhbGciOiJI). The full provisioning pod uses the same secretKeyRef; its env binding is therefore confirmed. (A full provisioning run could not observe the env because the PodCreate init-files container hit the pre-existing task-065 kind/WSL2 fileSidecar hang before the app container started — orthogonal to this credential wiring.)
<!-- SECTION:NOTES:END -->
