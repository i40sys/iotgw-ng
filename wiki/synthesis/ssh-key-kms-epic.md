---
title: SSH-Key-in-KMS Epic
category: synthesis
tags: [type/task, secrets/kms, provisioning/devices, status/current]
relationships:
  - target: "[[concepts/ssh-key-management-kms]]"
    type: implements
sources:
  - backlog/completed/task-040 - Update-Kestra-devices-workflow-for-SSH-key-generation-in-KMS.md
  - backlog/tasks/task-057 - Add-authentication-NetworkPolicy-to-Cosmian-KMS.md
  - backlog/tasks/task-069 - Inject-device-SSH-key-from-Cosmian-KMS-into-Kestra-OpenWRT-runner-pods-task-065-AC3.md
summary: The task-032..041 arc that put device SSH keys in Cosmian KMS — and how generation later moved OUT of the Kestra flow into the iotgw-ui backend, leaving the flow only to fetch+deploy.
provenance:
  extracted: 0.8
  inferred: 0.12
  ambiguous: 0.08
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# SSH-Key-in-KMS Epic

The execution arc behind [[concepts/ssh-key-management-kms]]. The in-flight
SSH-key-in-KMS work spanned **task-032 through task-041** (032/036/037/040/041
Done). ^[ambiguous]

## Phase 1 — generation in the Kestra devices flow (task-040, Done)

The original design (decision-010) generated the Ed25519 key in the Kestra
`iotgw-ng/devices` flow on device INSERT, via the `cosmian` CLI in an
`ubuntu:24.04` container (Ubuntu 24.04 was required — the cosmian-cli `.deb` needs
libc6 ≥ 2.38), tagged `ssh-key` / `device-<id>` / `network-<id>` /
`created-<ts>`, then PATCHed `ssh_key_id` back into Supabase. Verified at flow
revision 12 with `networkMode: host`.

## Phase 2 — generation moved OUT of Kestra (decision-010 amendment, task-060)

> [!warning] Superseded generation path
> The Kestra-flow generation in task-040 was **superseded**. With the move to the
> `netmaker-call` provisioning chain ([[concepts/provisioning-call-chain]]) and
> the removal of the legacy Kestra `devices` flow, **SSH-key generation moved into
> the iotgw-ui backend** (`apps/backend/src/services/kms.ts`) over the KMIP REST
> API — no `cosmian` CLI, no `convert_keys.py`. The flow now only **fetches +
> deploys** the key.

## Phase 3 — hardening + in-pod fetch

- **task-057 (Done):** Cosmian KMS 5.20 **API-token auth** (`[http]
  api_token_id`) + a **NetworkPolicy** default-denying `:9998` except in-namespace
  clients; `KMS_AUTH_TOKEN` SOPS-stored and bridged to the `kms-auth` Secret.
  Verified: KMIP without token → 401; with token → 422 (auth accepted). kindnet
  **enforces** the policy, so the host→NodePort smoke falls back to an in-cluster
  probe ([[entities/cosmian-kms]]).
- **task-069 (Done):** the Kestra OpenWRT runner pod fetches the device key from
  KMS **in-pod** (`fetch_kms_key.py`, KMIP `Get` PKCS8 → OpenSSH `keys/id_rsa`)
  ([[synthesis/kestra-k8s-runner]]).

## Sources

- task-040 (generation), task-057 (KMS auth + NetworkPolicy), task-069 (in-pod fetch).
- Related: [[concepts/ssh-key-management-kms]], [[entities/cosmian-kms]], [[synthesis/kestra-k8s-runner]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/completed/task-040 - Update-Kestra-devices-workflow-for-SSH-key-generation-in-KMS|task-040 - Update-Kestra-devices-workflow-for-SSH-key-generation-in-KMS]]
- [[_sources/tasks/task-057 - Add-authentication-NetworkPolicy-to-Cosmian-KMS|task-057 - Add-authentication-NetworkPolicy-to-Cosmian-KMS]]
- [[_sources/tasks/task-069 - Inject-device-SSH-key-from-Cosmian-KMS-into-Kestra-OpenWRT-runner-pods-task-065-AC3|task-069 - Inject-device-SSH-key-from-Cosmian-KMS-into-Kestra-OpenWRT-runner-pods-task-065-AC3]]
