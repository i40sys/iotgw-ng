---
title: SSH Key Management with Cosmian KMS
category: concepts
tags: [secrets/kms, provisioning/devices, provisioning/openwrt, status/current]
relationships:
  - target: "[[entities/cosmian-kms]]"
    type: uses
  - target: "[[concepts/domains-networks-devices]]"
    type: related_to
sources:
  - backlog/decisions/decision-010-ssh-key-management-with-cosmian-kms.md
  - backlog/completed/task-040 - Update-Kestra-devices-workflow-for-SSH-key-generation-in-KMS.md
  - backlog/tasks/task-069 - Inject-device-SSH-key-from-Cosmian-KMS-into-Kestra-OpenWRT-runner-pods-task-065-AC3.md
summary: Device SSH keys live in Cosmian KMS, not the DB — the iotgw-ui backend mints them via the KMIP REST API; devices store only ssh_key_id; Kestra/Ansible fetches them at deploy time.
provenance:
  extracted: 0.82
  inferred: 0.08
  ambiguous: 0.1
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# SSH Key Management with Cosmian KMS

**Cosmian KMS is the authoritative store for device SSH keys.** The Supabase
database stores only a reference (`ssh_key_id`), never the key material — private
keys never sit in plaintext in the application database.

## Data model

- `devices.ssh_key_id VARCHAR(255)` — the KMS object id (format
  `device_ssh_<device_id>`), NOT the key material.
- KMS tagging convention for searchability: `ssh-key`, `device-<id>`,
  `network-<id>`, `domain-<id>`, `created-<timestamp>`.

## Where generation happens (amended 2026-06-17, task-060)

> [!warning] Generation moved out of Kestra
> The original ADR placed SSH-key **generation** in the Kestra `devices`
> workflow (via the `kestra-call` edge function). **That hop is gone.** Device
> provisioning moved to `netmaker-call` ([[concepts/provisioning-call-chain]]),
> and the legacy Kestra `devices`/`networks` flows were removed. The ADR's "Key
> Generation (Kestra Workflow)" section is **superseded** for the generation step
> (the tagging convention and `device_ssh_<id>` id format are retained).

**SSH-key generation now happens directly in the iotgw-ui backend**
(`apps/backend/src/services/kms.ts`), which talks to Cosmian KMS over its
**KMIP 2.1 JSON REST API** (`POST <KMS_URL>/kmip/2_1`) and derives the OpenSSH
public key locally with `node:crypto` — no `cosmian` CLI binary, no Python
`convert_keys.py` in the backend runtime. It runs:

- **automatically when a device is created** (`createDevice`, best-effort: a KMS
  failure leaves the device keyless rather than failing creation), and
- **on demand** via `generateMissingSshKey` (backfill / `force` regenerate).

`KMS_URL` is env-sourced from `secrets/` ([[concepts/secrets-management-sops-age]]).

## Deployment (unchanged — still Kestra/Ansible)

Key **deployment** to the gateway is unchanged: the install/provisioning Kestra
flows run Ansible that **fetches** the key from KMS by id (PKCS#8 PEM), converts
PKCS#8 → OpenSSH, and pushes it onto the device. The Ansible KMS-fetch role must
present `KMS_AUTH_TOKEN` (KMS hardening, task-057).

## Key lifecycle

| Event | Action |
|---|---|
| Device created | mint key in KMS (backend), store id in Supabase |
| Device deployed | export from KMS, convert PKCS#8→OpenSSH, deploy, cleanup |
| Device deleted | revoke + destroy key in KMS |
| Key rotation | create new key, update id, redeploy |

## Implementation status

The generation→fetch arc is traced in [[synthesis/ssh-key-kms-epic]]:
task-040 (Phase 1, Kestra-flow generation, later superseded), task-057 (KMS
API-token auth + NetworkPolicy), task-069 (in-pod KMS fetch in the runner pod —
[[synthesis/kestra-k8s-runner]]).

## Sources

- decision-010 (SSH Key Management with Cosmian KMS, ADR-001, amended task-060); task-040, task-069.
- Related: [[entities/cosmian-kms]], [[entities/kestra]], [[concepts/provisioning-call-chain]], [[synthesis/ssh-key-kms-epic]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/decisions/decision-010-ssh-key-management-with-cosmian-kms|decision-010-ssh-key-management-with-cosmian-kms]]
- [[_sources/completed/task-040 - Update-Kestra-devices-workflow-for-SSH-key-generation-in-KMS|task-040 - Update-Kestra-devices-workflow-for-SSH-key-generation-in-KMS]]
- [[_sources/tasks/task-069 - Inject-device-SSH-key-from-Cosmian-KMS-into-Kestra-OpenWRT-runner-pods-task-065-AC3|task-069 - Inject-device-SSH-key-from-Cosmian-KMS-into-Kestra-OpenWRT-runner-pods-task-065-AC3]]
