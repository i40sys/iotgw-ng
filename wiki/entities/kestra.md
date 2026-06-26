---
title: Kestra
category: entities
tags: [orchestration/kestra, orchestration/ansible, provisioning/openwrt, status/current]
relationships:
  - target: "[[concepts/provisioning-call-chain]]"
    type: related_to
  - target: "[[entities/edge-functions]]"
    type: related_to
sources:
  - backlog/docs/doc-016 - Kestra-Notification-Automation-Pattern.md
  - backlog/decisions/decision-016 - Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration.md
  - backlog/docs/doc-013 - Deployments-Page-Behavior-Specification.md
  - backlog/decisions/decision-010 - ADR-001-SSH-Key-Management-with-Cosmian-KMS.md
  - backlog/tasks/task-054 - Migrate-Kestra-Ansible-flows-to-the-Kubernetes-task-runner.md
  - backlog/tasks/task-065 - Fix-DownloadFiles-PodCreate-leading-slash-path-bug-blocking-Ansible-runner-pods.md
summary: The workflow orchestrator — NOT in the device/network provisioning path anymore; it runs Ansible flows (install/provisioning/connectivity-check) against OpenWRT gateways and is the durable-execution target.
provenance:
  extracted: 0.85
  inferred: 0.07
  ambiguous: 0.08
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Kestra

**Kestra** is the workflow orchestrator (`kestra:v1.3.22`, with a
`kestra-postgres` StatefulSet). It runs in the **`kestra`** namespace
([[concepts/namespace-per-subproject]]), UI/API on :8080 (NodePort 30808). Flow
source lives in the DB + the public `i40sys/iotgw-kestra` repo, re-imported via a
sync flow; the Kestra **flow namespace** `iotgw-ng` is a Kestra concept, not a
k8s namespace.

## What Kestra does (and does NOT do)

> [!warning] No longer in device/network provisioning
> Kestra is **no longer** in the device/network provisioning path — that runs
> through the `netmaker-call` edge function ([[concepts/provisioning-call-chain]]).
> The legacy Kestra `devices`/`networks` flows and the `kestra-call` edge
> function were **removed**.

Kestra remains the orchestrator for the **OpenWRT gateway** side:

- `install` / `provisioning` / `connectivity-check` flows run Ansible
  (`cytopia/ansible`) against gateways, **fetching** device SSH keys from Cosmian
  KMS ([[concepts/ssh-key-management-kms]]) to deploy them. (Deployments-page
  step → flow mapping in [[references/deployments-page-behavior]].)
- It installs the `oriolrius.netmaker` Ansible collection **from Galaxy** by FQCN
  at runtime (the source is external — [[synthesis/netmaker-collection-externalization]]).
- It is the **durable-execution target** for long-running webhook-originated work:
  the `kestra-dispatch` edge function triggers a flow via the Kestra REST API and
  records the execution id (the fast→edge, long-running→Kestra split, decision-016
  §6 — see [[entities/edge-functions]]).

## k8s runner (Done)

- There is **no Kubernetes taskRunner** at v1.3.22 — flows use
  `io.kestra.plugin.kubernetes.core.PodCreate` directly (no docker.sock,
  task-054). The runner pods live in `kestra` and present `KMS_AUTH_TOKEN` to
  reach the hardened KMS.
- A `DownloadFiles`→`PodCreate` **leading-slash path bug** (task-065) blocked the
  spawn and was fixed; the in-pod KMS key fetch and flow-source durability are
  covered in [[synthesis/kestra-k8s-runner]].

## Sources

- doc-016, decision-016 (§6 durable handoff), doc-013, decision-010; task-054, task-065.
- Related: [[entities/edge-functions]], [[entities/cosmian-kms]], [[entities/netmaker]], [[synthesis/kestra-k8s-runner]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/docs/doc-016 - Kestra-Notification-Automation-Pattern|doc-016 - Kestra-Notification-Automation-Pattern]]
- [[_sources/decisions/decision-016 - Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration|decision-016 - Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration]]
- [[_sources/docs/doc-013 - Deployments-Page-Behavior-Specification|doc-013 - Deployments-Page-Behavior-Specification]]
- [[_sources/decisions/decision-010 - ADR-001-SSH-Key-Management-with-Cosmian-KMS|decision-010 - ADR-001-SSH-Key-Management-with-Cosmian-KMS]]
- [[_sources/tasks/task-054 - Migrate-Kestra-Ansible-flows-to-the-Kubernetes-task-runner|task-054 - Migrate-Kestra-Ansible-flows-to-the-Kubernetes-task-runner]]
- [[_sources/tasks/task-065 - Fix-DownloadFiles-PodCreate-leading-slash-path-bug-blocking-Ansible-runner-pods|task-065 - Fix-DownloadFiles-PodCreate-leading-slash-path-bug-blocking-Ansible-runner-pods]]
