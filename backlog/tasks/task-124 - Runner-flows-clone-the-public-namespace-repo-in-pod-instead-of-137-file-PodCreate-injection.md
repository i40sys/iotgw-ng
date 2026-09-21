---
id: TASK-124
title: >-
  Runner flows: clone the public namespace repo in-pod instead of 137-file
  PodCreate injection
status: Done
assignee: []
created_date: '2026-09-21 08:32'
updated_date: '2026-09-21 08:39'
labels:
  - ssh-ca
  - kestra
  - performance
  - kind
dependencies: []
references:
  - backlog/tasks/task-065.md
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Kestra runner flows (provisioning/install/connectivity-check) inject the whole namespace tree (137 files, 125 in subdirs, ~692K) into the PodCreate init-files container as one exec/tar stream PER FILE. On kind/WSL2 each exec has multi-second latency, so staging takes ~9-10 min and often appears to hang (task-065 residual; reproduced live 2026-09-21 during task-106 verification — init-files stuck 9m41s, subdir file never landed). task-073 vendoring files/stacks/** roughly doubled the count. Since github.com/i40sys/iotgw-kestra is PUBLIC and git is in cytopia/ansible:latest-tools, the pod can 'git clone --depth 1' the whole tree in ONE operation and inject only the runtime-generated inventory.yml, dropping 137 exec streams to ~1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 provisioning/install/connectivity-check pods get past init-files in seconds, not minutes
- [x] #2 the pod clones the public repo (HEAD of main) and runs from it; only inventory.yml is injected
- [x] #3 KMS key fetch, ssh_ca anon-key preflight, __tags__ handling, and secretKeyRefs are preserved
- [x] #4 a 0.0.0.0 dummy-target provisioning run reaches the ansible stage (SSH failure to 0.0.0.0 is expected/OK)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed by replacing the 137-file PodCreate inputFiles injection with an in-pod git clone of the public repo, across all three runner flows (i40sys/iotgw-kestra commit e4d2678):

**Per flow (Flow.yaml/provisioning, install-flow.yaml, connectivity-check-flow.yaml):**
- Removed the stage_namespace_files (DownloadFiles) task — nothing else referenced its outputs.
- inputFiles now injects ONLY the runtime-generated inventory.yml (root-level, 1 file).
- First lines of the container command (after set -e):
    git clone --depth 1 https://github.com/i40sys/iotgw-kestra /tmp/nsrepo
    cp -a /tmp/nsrepo/. .
    rm -rf .git /tmp/nsrepo
- Everything else unchanged: KMS fetch, chmod keys/id_rsa, ssh_ca anon-key preflight, __tags__ handling, ansible-galaxy installs, secretKeyRefs, ProxyCommand/VPN_JUMP_HOST.
- Verified against the exact-version schema (Kestra v1.3.35): PodCreate.inputFiles = map<string,string>.

**Re-registered** all three via PUT /api/v1/main/flows/iotgw-ng/{id} (git sync does NOT touch flow defs) → provisioning rev 3, install rev 2, connectivity-check rev 3; all passed /flows/validate.

**Live test (provisioning, target_ip 0.0.0.0, exec 4qn1mrc7dNjFiPVjRF8uCK):**
- BEFORE: init-files staging ~9m41s (137 files).
- AFTER: ~62s (pod 08:35:39 → ready marker 08:36:41), a ~9.4x reduction; immediately proceeded into git clone + pip + ansible-galaxy (~5s). github.com egress from the pod works; no .git carried into inputFiles.
- Run then failed at `chmod 600 keys/id_rsa: No such file` because the test used the empty-ssh_key_id default (skips KMS fetch) — PRE-EXISTING/unmodified line, identical failure in the old flow; proves the pod got well past staging/clone/galaxy. A real run packs ssh_key_id so KMS creates the key first.

No real gateway IP used (0.0.0.0 throughout). Temporary VPN_JUMP_HOST kv added to let the pod spawn, deleted afterward.
<!-- SECTION:NOTES:END -->
