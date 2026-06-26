---
title: iotgw-ng
category: project
tags: [infra/kubernetes, app/iotgw-ui, status/current]
source_path: /home/oriol/iotgw-ng/backlog
summary: IoT Gateway Next Generation — a single-repo Kubernetes platform that provisions WireGuard/Netmaker VPNs for OpenWRT gateways via a Supabase-trigger-driven call chain.
sources: []
created: 2026-06-26
updated: 2026-06-26
---

# iotgw-ng

**IoT Gateway Next Generation** is a consolidated monorepo platform for managing
IoT gateway devices: organizing them into a Domains → Networks → Devices
hierarchy, provisioning their WireGuard VPN access through Netmaker, and managing
their OpenWRT software via Ansible orchestration. The whole platform runs on
**Kubernetes** (kind locally), one namespace per subproject.

This wiki distils the project `backlog/` (ADRs `decision-0xx`, validated docs
`doc-0xx`, milestones). Decisions are the highest authority.

## The Spine

The single most important concept is the **provisioning call chain** — how a UI
action becomes a real Netmaker resource:

- [[concepts/provisioning-call-chain]] — UI → tRPC backend → Supabase → pg_net trigger → `netmaker-call` edge function → Netmaker REST.

## Core Concepts

- [[concepts/domains-networks-devices]] — the entity hierarchy and data model.
- [[concepts/kubernetes-migration-kind]] — kustomize + local kind; the sole runtime.
- [[concepts/namespace-per-subproject]] — one k8s namespace per subproject; `iotgw` is the cluster, not a namespace.
- [[concepts/secrets-management-sops-age]] — SOPS + age as the one secrets mechanism.
- [[concepts/ssh-key-management-kms]] — device SSH keys live in Cosmian KMS, not the DB.
- [[concepts/totp-device-vpn-auth]] — counter-based TOTP for device VPN config retrieval.
- [[concepts/monorepo-organization]] — single flat repo, logical grouping.
- [[concepts/iotgw-ui-architecture]] — React 19 + Fastify/tRPC + pnpm workspace.

## Entities (tools)

- [[entities/netmaker]] · [[entities/cosmian-kms]] · [[entities/kestra]] · [[entities/supabase]] · [[entities/stackgres]]
- [[entities/kind]] · [[entities/ingress-nginx]] · [[entities/edge-functions]] · [[entities/headlamp]] · [[entities/keycloak]]

## References (lookups)

- [[references/service-ports-and-namespaces]]
- [[references/container-image-cicd]]
- [[references/database-migrations-webhooks]]
- [[references/deployments-page-behavior]]
- [[references/openwrt-wireguard-config]]

## Synthesis (cross-cutting)

*Decisions/architecture:*
- [[synthesis/docker-compose-decommission]]
- [[synthesis/secret-exposure-rotation-runbook]]
- [[synthesis/netmaker-collection-externalization]]

*Epics & feature history (task provenance):*
- [[synthesis/k8s-migration-epic]] · [[synthesis/namespace-split-epic]] · [[synthesis/image-cicd-epic]]
- [[synthesis/kestra-k8s-runner]] · [[synthesis/ssh-key-kms-epic]]
- [[synthesis/network-crud-and-jobs-feature-history]] · [[synthesis/deployments-feature-history]]

## Milestones & task status (as of 2026-06-26)

The 2026-Q2 k8s-replatforming program has landed its major milestones — all
**Done**. Snapshot + open threads: [[journal/2026-06-26]].

| Milestone | Tasks | Status |
|---|---|---|
| Decommission docker-compose → k8s | task-062 (+18) | Done |
| Namespace-per-subproject split | task-064 (+15) | Done (06-23) |
| Container image CI/CD (ghcr.io/i40sys) | task-067 (+18) | Done (06-25) |
| Extract netmaker collection | task-068 (+8) | Done (06-25) |
| Headlamp dashboard | task-063 | Done |
| Kestra k8s runner + KMS fetch | task-054/065/066/069 | Done |
| Domains/Networks/Devices CRUD + jobs | completed/ series | Done |
| Deployments + deployment_jobs (archived) | archive/ task-001..021 | Done (historical) |

Open residuals: `task-067.18` (prod frontend `VITE_API_URL`), `task-062.05`
(Kestra flow/KV re-seed reproducibility).

## Skills (how-to)

- [[skills/deploy-on-kind]]
- [[skills/iotgw-ui-development-workflow]]
- [[skills/testing-with-vitest]]

## Subprojects (repo map)

`iotgw-ui/` (UI + backend + contract), `supabase/` (self-hosted stack +
`volumes/functions/` edge fns), `kestra/` (orchestration), `kms/` (Cosmian KMS),
`deploy/` (k8s/kustomize + kind), `secrets/` (SOPS+age), `tools/`, `backlog/`.
The `oriolrius.netmaker` Ansible collection is **external** ([[synthesis/netmaker-collection-externalization]]).
