---
title: Kestra k8s PodCreate Runner
category: synthesis
tags: [type/task, orchestration/kestra, infra/kubernetes, secrets/kms, provisioning/openwrt, status/current]
relationships:
  - target: "[[entities/kestra]]"
    type: related_to
  - target: "[[concepts/ssh-key-management-kms]]"
    type: uses
sources:
  - backlog/tasks/task-054 - Migrate-Kestra-Ansible-flows-to-the-Kubernetes-task-runner.md
  - backlog/tasks/task-065 - Fix-DownloadFiles-PodCreate-leading-slash-path-bug-blocking-Ansible-runner-pods.md
  - backlog/tasks/task-066 - Make-Kestra-flow-namespace-kestra-durable-against-sync-namespace-files-Gitea-source.md
  - backlog/tasks/task-069 - Inject-device-SSH-key-from-Cosmian-KMS-into-Kestra-OpenWRT-runner-pods-task-065-AC3.md
summary: How the OpenWRT Ansible flows run under k8s — no Kubernetes taskRunner exists at v1.3.22, so flows use PodCreate directly; covers the leading-slash bug, flow-source durability, and in-pod KMS key fetch.
provenance:
  extracted: 0.85
  inferred: 0.08
  ambiguous: 0.07
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Kestra k8s PodCreate Runner

How the OpenWRT Ansible flows (`install` / `provisioning` / `connectivity-check`)
run under Kubernetes after the docker.sock Docker task runner was retired
([[entities/kestra]], [[synthesis/k8s-migration-epic]]).

## No Kubernetes taskRunner — use PodCreate directly (task-054)

> [!warning] Version-exact finding
> At **Kestra v1.3.22**, `io.kestra.plugin.ansible.cli.AnsibleCLI.taskRunner`
> accepts only **Docker or Process** — there is **NO Kubernetes taskRunner**
> registered (plugin-kubernetes v1.9.1 exposes none). So the migration replaces
> `AnsibleCLI`+Docker with `io.kestra.plugin.kubernetes.core.PodCreate` directly
> (cytopia/ansible as the pod container).

The auto-namespaceFiles the Docker runner provided is replaced by an explicit
`io.kestra.plugin.core.namespace.DownloadFiles` → `PodCreate` `inputFiles` merge.
RBAC: a `kestra` ServiceAccount + `kestra-pod-runner` Role (pods
create/get/list/watch/delete/patch, pods/log, pods/exec); PodCreate uses fabric8
in-cluster auto-detection (SA token).

## The leading-slash bug (task-065)

`DownloadFiles` emits every namespace-file key with a **leading `/`** (97 keys);
`PodCreate.run()`'s pre-flight `validFilename()` **rejects** any `inputFiles` key
starting with `/`, so the runner pod was never created (~0.13 s
`Invalid outputFile (only relative path is supported)`). Every scheduled run was
failing. **Fix:** a Pebble JSON-builder strips the leading `/`
(`key | replace({'^/': ''}, regexp=true)` — the `regexp=true` is load-bearing) and
skips the `.git/` blob (98→87 keys). Applied to all 3 flows in the live Kestra DB
**and** the canonical flow source.

## Flow-source durability (task-066)

`sync-namespace-files` runs only `SyncNamespaceFiles` (file blobs) — there is **no
`SyncFlows` task**, so it does **NOT** revert flow definitions (verified across 3
daily syncs). The canonical source was nonetheless aligned to the live state
(`PodCreate namespace: iotgw → kestra`) to close a source-of-truth divergence
footgun.

## In-pod KMS key fetch (task-069, the task-065 AC#3 spin-out)

Per [[concepts/ssh-key-management-kms]], device keys live in Cosmian KMS, but
nothing injected `keys/id_rsa` into the runner pod (the committed
`files/credentials/id_rsa` was a different, unused path). Fix: a repo-root
`fetch_kms_key.py` issues a KMIP 2.1 `Get` (`KeyFormatType=PKCS8`) to
`cosmian-kms.kms.svc.cluster.local:9998/kmip/2_1` with `Authorization: Bearer
$KMS_AUTH_TOKEN`, and writes an OpenSSH `keys/id_rsa` (mode 600) **in the pod**
before ansible runs. `KMS_AUTH_TOKEN` comes from the `kms-auth` Secret (bridged
into the `kestra` namespace by `bootstrap.sh`); `SSH_KEY_ID` (`device_ssh_<id>`)
is packed by the backend / a flow input.

## End-to-end demonstration (2026-06-26)

The full arc was verified online against a real gateway: slash-fix → pod spawns →
`fetch_kms_key` materializes `keys/id_rsa` → ansible ping `ok=1
unreachable=0`. The canonical flow source also moved from private Gitea to the
**public** `github.com/i40sys/iotgw-kestra` (secret-free, fresh history;
`sync-namespace-files` repointed there). ^[inferred]

## Sources

- task-054 (runner), task-065 (slash bug), task-066 (durability), task-069 (KMS fetch).
- Related: [[entities/kestra]], [[concepts/ssh-key-management-kms]], [[synthesis/namespace-split-epic]].
