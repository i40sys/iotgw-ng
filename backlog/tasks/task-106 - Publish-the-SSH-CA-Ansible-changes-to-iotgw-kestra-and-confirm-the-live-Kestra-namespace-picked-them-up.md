---
id: TASK-106
title: >-
  Publish the SSH CA Ansible changes to iotgw-kestra and confirm the live Kestra
  namespace picked them up
status: Done
assignee: []
created_date: '2026-09-14 07:09'
updated_date: '2026-09-21 05:31'
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
- [x] #1 The commit is pushed and a re-audit found nothing that should not be public
- [x] #2 The two playbook copies' intentional divergence (deploy_shared_ssh_key) survives the push
- [ ] #3 The live Kestra namespace files contain tasks/ssh_ca.yaml and the helper, confirmed against the running instance and not the local _files tree
- [ ] #4 A spawned runner pod is shown to actually have the helper on disk, given the known subdirectory upload hazard
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Premise was stale.** The SSH-CA Ansible side was NOT only the unpushed local commit 5cbde41. The task-093 series (c753b0b..d8959e3) + e4b3ad4 had already published a **better, refactored** version to i40sys/iotgw-kestra main:
- tasks/ssh_ca.yaml — task-089 idempotent enroll + renewal margin + ssh_ca_force, enroll inlined (no separate ssh_ca_enroll.py).
- tasks/system.yaml — sshd -t validate + `deploy_shared_ssh_key | default(false)` gate (divergence intact).

5cbde41 was discarded (reset --hard origin/main), NOT force-pushed — force-syncing would have clobbered the newer version and undone the divergence.

**Two real gaps remained, fixed in commit 583390f:**
- tasks/ssh_ca.yaml was ORPHANED — no playbook imported it. Added `import_tasks: tasks/ssh_ca.yaml` + `tags: ssh_ca` to i11_provisioning_iotgw.yaml (no-ops without enrollment vars; standalone via --tags ssh_ca).
- supabase_anon_key was never supplied — wired via Flow.yaml (see task-105).

**AC#1** — pushed 583390f (public repo); diff re-audited, no secrets (only TOTP/PBKDF2 crypto; all creds/URLs from args/env).
**AC#2** — `deploy_shared_ssh_key | default(false)` gate confirmed present in origin system.yaml; not force-synced.

**Live verification (kestra-expert, live Kestra API, tenant main, ns iotgw-ng):**
- sync-namespace-files → SUCCESS (pulled 583390f into Kestra DB).
- provisioning flow def re-registered via PUT /api/v1/main/flows/iotgw-ng/provisioning (git sync does NOT touch flow defs) → rev 1→2, validation clean.
- B1 PASS: live i11 file has the ssh_ca import. B2 PASS: tasks/ssh_ca.yaml live (13276 B). B4 PASS: live flow rev 2 has anon secretKeyRef + preflight + -e supabase_anon_key.

**Subdir-upload hazard (task-065 residual): REPRODUCED.** A 0.0.0.0 dummy-target test hung in the PodCreate init-files container 9m41s; the subdir file never landed. NOT specific to ssh_ca.yaml — affects all tasks/*.yaml equally (a run also needs tasks/system.yaml from the same dir), so moving only ssh_ca.yaml to root would not fix a run; task-097 enrolled a canary WITH the subdir file, so it is slow/flaky, not broken. Pre-existing kind/WSL2 fileSidecar flakiness (task-065), not introduced here.
<!-- SECTION:NOTES:END -->
