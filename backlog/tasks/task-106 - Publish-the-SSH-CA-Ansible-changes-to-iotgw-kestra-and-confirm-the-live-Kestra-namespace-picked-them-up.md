---
id: TASK-106
title: >-
  Publish the SSH CA Ansible changes to iotgw-kestra and confirm the live Kestra
  namespace picked them up
status: To Do
assignee: []
created_date: '2026-09-14 07:09'
updated_date: '2026-09-14 07:35'
labels:
  - ssh-ca
  - kestra
  - ansible
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Ansible side of the migration exists as an **unpushed local commit**: `~/iotgw-kestra` commit `5cbde41` (`tasks/ssh_ca.yaml`, `files/ssh_ca_enroll.py`, `Flow.yaml` env, `i11_provisioning_iotgw.yaml` wiring, `tasks/system.yaml` sshd hardening). Until it is pushed, none of it runs.

`github.com/i40sys/iotgw-kestra` is **public**, so this is a publish, not just a push. Re-audit the diff for anything that should not be public before pushing — the repo's history was deliberately sanitised (task-069 AC#4) and `tasks/system.yaml` in that copy gates the shared key behind `deploy_shared_ssh_key | default(false)`, which the `owrt_iot_gw` copy does not. Do not undo that divergence by force-syncing one copy over the other.

Then propagate: trigger `sync-namespace-files` (or the `/sync-kestra` skill) and confirm the **live Kestra DB** actually has the new files — the local `kestra/data/main/iotgw-ng/_files/` tree is a stale write-through artefact and proves nothing.

**Known propagation hazard (task-065 residual):** the PodCreate fileSidecar uploads root-level files reliably but subdirectory files via a lagging tar that can take minutes or never land. `fetch_kms_key.py` was put at the repo root for exactly this reason. `ssh_ca_enroll.py` is at `files/ssh_ca_enroll.py` — a subdirectory — so verify it actually materialises in a runner pod, and move it to the root if it does not.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The commit is pushed and a re-audit found nothing that should not be public
- [ ] #2 The two playbook copies' intentional divergence (deploy_shared_ssh_key) survives the push
- [ ] #3 The live Kestra namespace files contain tasks/ssh_ca.yaml and the helper, confirmed against the running instance and not the local _files tree
- [ ] #4 A spawned runner pod is shown to actually have the helper on disk, given the known subdirectory upload hazard
<!-- AC:END -->
