---
id: TASK-065
title: >-
  Fix DownloadFiles->PodCreate leading-slash path bug blocking Ansible runner
  pods
status: Done
assignee: []
created_date: '2026-06-23 05:50'
updated_date: '2026-06-26 09:48'
labels:
  - kestra
  - bug
  - k8s
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pre-existing bug (independent of the namespace split, surfaced during task-064.07 validation): triggering the connectivity-check/install/provisioning flows fails at the PodCreate task before the runner pod is created. io.kestra.plugin.kubernetes.core.PodCreate.run() -> PluginUtilsService.createInputFiles() rejects inputFiles map keys with a leading '/' (e.g. '/tasks/partitions.yaml') emitted by the DownloadFiles stage_namespace_files output. So no Ansible runner pod is spawned. Present in both the old iotgw and new kestra namespaces. The k8s routing/RBAC is correct (kestra SA -> kestra-pod-runner Role in the kestra ns; NetworkPolicy admits managed-by=kestra pods to the KMS) — only the inputFiles path needs fixing (strip leading '/', or fix the DownloadFiles->PodCreate handoff).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Triggering connectivity-check spawns a managed-by=kestra runner pod in the kestra namespace (no leading-slash path error)
- [x] #2 install + provisioning flows likewise reach pod creation
- [ ] #3 A runner pod fetches a device SSH key from cosmian-kms.kms over the FQDN (NetworkPolicy permits it)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Assessment 2026-06-25 (workflow-verified, high confidence, survived adversarial refute): VALID — solve. Not obsolete.**

The bug is LIVE and actively failing every scheduled run:
- **Live error today:** `run_connectivity_check` (the PodCreate step) FAILS in ~0.13s with `Invalid outputFile (only relative path is supported) for path '/tasks/partitions.yaml'` — exec `1ZfBVz1XQ5CDUsxLalnf6J` @ 2026-06-25T12:00:01Z; 6 consecutive scheduled fails (06-24/25).
- **Root cause confirmed at installed versions** (Kestra **v1.3.22**, plugin-kubernetes **1.9.1**): `PluginUtilsService.validFilename()` throws on any `inputFiles` key starting with `/`, invoked by `PodCreate.run()` BEFORE `findOrCreatePod` (pre-flight — explains the ~0.13s fail and zero pods). `stage_namespace_files` succeeds but emits **97/97 keys with a leading `/`** (`/tasks/partitions.yaml`, `/CLAUDE.md`, …); the `inputFiles` expression passes them raw.
- **Not a routing problem:** PodCreate is correctly `namespace: kestra` (rev 2); `iotgw` ns is absent (correct); RBAC `kestra-pod-runner` + KMS NetworkPolicy verified correct. Zero `managed-by=kestra` pods ever created.

**Fix (scope):** strip the leading `/` from each `inputFiles` map key before PodCreate, in all 3 OpenWRT flows. Because `sync-namespace-files` does NOT register flows, apply to the **LIVE flow DB via the Kestra API/UI** (PUT /flows, ns `iotgw-ng`) AND mirror to the **canonical Gitea source** `git.oriolrius.cat/oriolrius/iotgw-kestra` (Flow.yaml ~L61, connectivity-check-flow.yaml ~L48, install-flow.yaml ~L49). The gitignored local mirror under `kestra/data/main/iotgw-ng/_files/` refreshes as a write-through side effect — do NOT hand-edit it as source of truth. Do NOT touch RBAC or the NetworkPolicy.

**Residual risks (flagged, not blockers):**
- AC#3 (a runner pod fetching a KMS SSH key over the FQDN) cannot be exercised until the slash fix lets a pod spawn.
- Possible downstream blocker: flows `chmod 600 keys/id_rsa` / `ansible_ssh_private_key_file: keys/id_rsa` — once keys are injected, verify the live namespace-file blob store still carries a valid `keys/id_rsa`.

**Priority raised medium→high:** this fully blocks the OpenWRT install/connectivity-check/provisioning path (every scheduled run fails).

**Implementation 2026-06-25 (DONE — slash bug fixed, ansible-launch demonstrated):**

**Root cause (confirmed live):** `DownloadFiles` (`stage_namespace_files`) emits every namespace-file key with a leading `/` (verified: 97 keys, all `/...`). `PodCreate.run()` pre-flight `PluginUtilsService.validFilename()` rejects any `inputFiles` key starting with `/`, so the runner pod was never created (~0.13s `Invalid outputFile (only relative path is supported)`).

**Fix applied (all 3 OpenWRT flows — `connectivity-check` L48, `install` L49, `provisioning`/Flow.yaml L61):** replaced the single `inputFiles: "{{ ...files | merge({...}) }}"` line with a Pebble JSON-builder that
- strips the leading `/` from each key — `key | replace({'^/': ''}, regexp=true)` (empirically verified: WITHOUT `regexp=true` it is a no-op; `slice(1,len)` also works but is less explicit), and
- skips the synced `.git/` blob — `{% if (key | split('/'))[1] != '.git' %}` — whose binary pack needlessly bloats the per-file fileSidecar upload (98→87 keys).
Built map is valid JSON (verified: 0 leading-slash keys, 0 `.git` keys) and merges `inventory.yml`.

**Propagation (3 authoritative locations, all consistent):**
- Live flow registrations in Kestra DB (ns `iotgw-ng`) updated via Kestra API `PUT /flows` → all at **rev 3**.
- Canonical Gitea source `git.oriolrius.cat/oriolrius/iotgw-kestra` (`Flow.yaml`, `connectivity-check-flow.yaml`, `install-flow.yaml`) — commit `0b0d795` pushed to `main`.
- Kestra namespace-file copies refreshed via `sync-namespace-files` (pulls that Gitea repo) — verified the synced blob carries the fix.
- Note: the on-disk `kestra/data/main/iotgw-ng/_files/` mirror is a stale, gitignored docker-compose-era artifact — NOT write-through in the k8s deployment (Kestra stores namespace files in its in-cluster postgres/internal storage). Left untouched per guidance.

**Verification (live, kind cluster):**
- AC#1 ✓ — real `connectivity-check` run spawns pod `iotgw-ng-connectivity-check-run-connectivity-check-kjrqoxf3` (label `managed-by=kestra`) in ns `kestra`; Kestra log `Pod '...' is created`; NO leading-slash error.
- AC#2 ✓ — real `install` and `provisioning` runs likewise spawn runner pods (`...install-5nfakwjo`, `...provisioning-iotgw-deployment-m46lppin`).
- Ansible-launch demonstrated end-to-end via a faithful minimal pod (slash-fixed inject of `connectivity_check.yml` + `inventory.yml`): `ansible [core 2.21.0]` launches `ansible-playbook -i inventory.yml connectivity_check.yml`, runs the PLAY/TASK, attempts SSH and returns `UNREACHABLE! ... connect to host 0.0.0.0 port 22` — exactly as expected with no real target host.

**Residuals (separate from the slash bug; NOT addressed here):**
- **AC#3 NOT met (follow-up):** these flows do not fetch from Cosmian KMS — they `chmod 600 keys/id_rsa` expecting a namespace file. The live blob has `files/credentials/id_rsa` but **no `keys/id_rsa`**, so the real flows now reach PodCreate then fail downstream at `chmod` (with `set -e`) before ansible. AC#3 (runner pod fetching a KMS SSH key over the FQDN) needs a keys-injection mechanism (restore `keys/id_rsa`, or add a KMS-fetch step) — recommend a dedicated follow-up task. RBAC `kestra-pod-runner` already grants `pods/exec`; KMS NetworkPolicy unchanged.
- **fileSidecar upload is slow** in kind/WSL2 (Kestra uploads each inputFile via a separate exec/tar stream; the marker write lags) — minutes for ~87 files. Excluding `.git` mitigates it; consider scoping each flow's DownloadFiles glob to only the files its playbook needs as a future optimization.

**Full outcome — end-to-end demonstration (2026-06-26):** task-065's original goal ("trigger the flow and demonstrate ansible launches / the process starts") is now fully met AND extended to a real, successful run against a live gateway. The complete arc:

- **1. Slash fix (this task) — DONE & verified:** all 3 OpenWRT flows reach PodCreate and spawn a `managed-by=kestra` runner pod; ansible launches (no `validFilename` pre-flight failure). Proven on connectivity-check / install / provisioning.
- **2. Per-device KMS SSH keys (task-065 AC#3 -> spun out to TASK-069) — DONE:** the runner pod fetches the device's SSH key from Cosmian KMS in-pod (`fetch_kms_key.py`, KMIP `Get` KeyFormatType=PKCS8 -> OpenSSH `keys/id_rsa`), replacing the missing/static key. Token via the `kms-auth` Secret (bridged into the `kestra` ns by `bootstrap.sh`).
- **3. Public, secret-free, operational flow repo:** the canonical flow source moved from the private Gitea to the PUBLIC `github.com/i40sys/iotgw-kestra` (fresh single-commit history; no secrets — bastion via `{{ kv('VPN_JUMP_HOST') }}`, app PATs via `json_data` extra-vars, shared key dropped). `sync-namespace-files` repointed at GitHub; Gitea retired as source (kept private).
- **4. Real test fixture:** created a domain -> network -> device via the backend tRPC (no inbound auth; flat procedures at root, RAW body). `createDevice` auto-minted the device's KMS ed25519 key (`ssh_key_id = device_ssh_<deviceId>`); its public key was deployed to the test gateway's `authorized_keys`.
- **5. VERIFIED ONLINE:** `connectivity-check` against the real gateway -> `fetch_kms_key: materialized keys/id_rsa` -> ansible ping `ok=1 changed=0 unreachable=0`. The flow logs into a real host with a KMS-sourced key (non-destructive). A raw SSH from a kestra pod with the same key also succeeded.

**Operator runbook:** a step-by-step "launch the check-online flow + browse the Kestra UI" guide is kept off-repo (portable, on the operator pendrive), with a verified live demonstration embedded.
<!-- SECTION:NOTES:END -->
