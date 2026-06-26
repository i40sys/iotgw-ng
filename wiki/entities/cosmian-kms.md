---
title: Cosmian KMS
category: entities
tags: [secrets/kms, infra/kubernetes, status/current]
relationships:
  - target: "[[concepts/ssh-key-management-kms]]"
    type: related_to
sources:
  - backlog/decisions/decision-010 - ADR-001-SSH-Key-Management-with-Cosmian-KMS.md
  - backlog/decisions/decision-015 - Kubernetes-Migration-with-local-kind.md
  - backlog/tasks/task-057 - Add-authentication-NetworkPolicy-to-Cosmian-KMS.md
summary: The KMIP-compliant key store (cosmian/kms 5.20.0) that holds device SSH keys; runs in the kms namespace, API-token-auth + NetworkPolicy-hardened, reached in-cluster.
provenance:
  extracted: 0.85
  inferred: 0.05
  ambiguous: 0.1
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Cosmian KMS

**Cosmian KMS** is the enterprise key-management service (KMIP-compliant) that is
the authoritative store for **device SSH keys** ([[concepts/ssh-key-management-kms]]).
Image `ghcr.io/cosmian/kms:5.20.0` (upstream pull-only — no CI of ours).

## How the platform uses it

- The iotgw-ui backend mints SSH keys directly via the KMIP 2.1 JSON REST API
  (`POST <KMS_URL>/kmip/2_1`); devices store only `ssh_key_id`.
- Kestra/Ansible **fetches** keys from KMS by id at deploy time (PKCS#8 → OpenSSH).

## Deployment (k8s)

- Runs as a **StatefulSet + PVC** (SQLite backing, 1 replica) in the **`kms`
  namespace** ([[concepts/namespace-per-subproject]]). Port 9998 (NodePort 30998).
- kind pinned to `kindest/node:v1.31.12` partly because containerd 2.x rejects
  the minimal `cosmian/kms` image ([[concepts/kubernetes-migration-kind]]).
- **Hardened (task-057):** requires **API-token auth** (Cosmian KMS 5.20,
  `Authorization: Bearer <token>` = base64 of the `iotgw_api_token` key's raw
  bytes lowercased) and is fronted by a **NetworkPolicy** that default-denies
  ingress to `:9998` except in-namespace clients (iotgw-ui-backend, kestra, and
  Kestra-spawned runner pods labelled `app.kubernetes.io/managed-by: kestra`).
  The token is SOPS-stored (`KMS_AUTH_TOKEN`). The `kindnet` CNI **enforces** the
  policy, so the host→NodePort smoke is blocked and falls back to an in-cluster
  probe.

Reached in-cluster at `cosmian-kms.kms.svc.cluster.local:9998`.

The hardening was delivered as **task-057** (Done): verified KMIP-without-token →
401, with-token → 422 (auth accepted); kindnet enforces the NetworkPolicy
(allowed backend → 200, denied kong → timeout). See [[synthesis/ssh-key-kms-epic]].

## Sources

- decision-010 (SSH key management), decision-015 (k8s migration + KMS hardening); task-057.
- Related: [[concepts/ssh-key-management-kms]], [[concepts/namespace-per-subproject]], [[entities/kestra]], [[synthesis/ssh-key-kms-epic]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/decisions/decision-010 - ADR-001-SSH-Key-Management-with-Cosmian-KMS|decision-010 - ADR-001-SSH-Key-Management-with-Cosmian-KMS]]
- [[_sources/decisions/decision-015 - Kubernetes-Migration-with-local-kind|decision-015 - Kubernetes-Migration-with-local-kind]]
- [[_sources/tasks/task-057 - Add-authentication-NetworkPolicy-to-Cosmian-KMS|task-057 - Add-authentication-NetworkPolicy-to-Cosmian-KMS]]
