---
title: Wiki Index
---

# Wiki Index — iotgw-ng Knowledge Base

*Maintained by the obsidian-wiki skills. Last updated: 2026-06-26*

Source of truth: the project [[backlog]] (`backlog/` — decisions, docs, milestones, tasks).
The full backlog is ingested: decisions + docs (the backbone) plus tasks / completed /
archive (task provenance, distilled into the epic & feature-history synthesis pages below).

## Concepts

- [[provisioning-call-chain]] — UI → tRPC → Supabase → pg_net → netmaker-call → Netmaker REST; the platform spine ( #data/edge-functions #vpn/netmaker)
- [[domains-networks-devices]] — Domain → Network → Device hierarchy, cascade FKs, RLS ( #provisioning/devices #data/postgres)
- [[kubernetes-migration-kind]] — kustomize + local kind; the sole runtime ( #infra/kubernetes #infra/kind)
- [[namespace-per-subproject]] — one namespace per subproject; iotgw is the cluster ( #infra/kubernetes #infra/networking)
- [[secrets-management-sops-age]] — SOPS+age as the one secrets mechanism ( #secrets/sops)
- [[ssh-key-management-kms]] — device SSH keys in Cosmian KMS, not the DB ( #secrets/kms #provisioning/devices)
- [[totp-device-vpn-auth]] — counter-based TOTP for device VPN config ( #secrets/totp #vpn/wireguard)
- [[monorepo-organization]] — single flat repo, logical grouping ( #type/decision)
- [[iotgw-ui-architecture]] — React 19 + Fastify/tRPC + pnpm workspace ( #app/iotgw-ui #app/trpc)

## Entities

- [[netmaker]] — WireGuard VPN control plane (shared production, not rotatable) ( #vpn/netmaker)
- [[cosmian-kms]] — KMIP key store for device SSH keys ( #secrets/kms)
- [[kestra]] — workflow orchestrator (OpenWRT/Ansible side only) ( #orchestration/kestra)
- [[supabase]] — self-hosted Supabase stack (DB + app tier) ( #data/supabase)
- [[stackgres]] — Postgres operator managing the supabase-db SGCluster ( #data/postgres)
- [[kind]] — local single-node cluster, node v1.31.12 ( #infra/kind)
- [[ingress-nginx]] — Ingress controller; TLS termination ( #infra/ingress)
- [[edge-functions]] — Deno workers (netmaker-call / kestra-dispatch / vpn) ( #data/edge-functions)
- [[headlamp]] — in-cluster k8s dashboard, Keycloak OIDC ( #infra/kubernetes)
- [[keycloak]] — platform IdP (realm iotgw @ iam.joor.net) ( #infra/kubernetes)

## Skills

- [[deploy-on-kind]] — bring the platform up on the local kind cluster ( #infra/kind #secrets/sops)
- [[iotgw-ui-development-workflow]] — the pnpm-workspace dev loop ( #app/iotgw-ui)
- [[testing-with-vitest]] — Vitest + RTL testing patterns ( #app/iotgw-ui)

## References

- [[service-ports-and-namespaces]] — service/namespace/port + FQDN lookup ( #infra/kubernetes #infra/networking)
- [[container-image-cicd]] — the 3 custom images + supply-chain policy ( #cicd/images)
- [[database-migrations-webhooks]] — migrations + pg_net webhook triggers ( #data/migrations)
- [[deployments-page-behavior]] — the 4-step deployment wizard ( #app/frontend #provisioning/openwrt)
- [[openwrt-wireguard-config]] — OpenWRT WireGuard reference config ( #vpn/wireguard)

## Synthesis

*Decisions/architecture:*
- [[docker-compose-decommission]] — compose retired; k8s as the sole runtime ( #infra/kubernetes)
- [[secret-exposure-rotation-runbook]] — the 88-secret sweep + rotation runbook ( #secrets/sops)
- [[netmaker-collection-externalization]] — Ansible collection pulled back out of the monorepo ( #orchestration/ansible)

*Epics & feature history (task provenance, pass 2):*
- [[k8s-migration-epic]] — TASK-062 docker-compose decommission milestone, Done ( #type/task #infra/kubernetes)
- [[namespace-split-epic]] — TASK-064 namespace split, Done ( #type/task #infra/kubernetes)
- [[image-cicd-epic]] — TASK-067 ghcr.io/i40sys pipeline, Done ( #type/task #cicd/images)
- [[kestra-k8s-runner]] — PodCreate runner, slash bug, in-pod KMS fetch ( #type/task #orchestration/kestra)
- [[ssh-key-kms-epic]] — device SSH keys into Cosmian KMS ( #type/task #secrets/kms)
- [[network-crud-and-jobs-feature-history]] — Domains/Networks/Devices CRUD + *_jobs ( #type/task #provisioning/devices)
- [[deployments-feature-history]] — archived deployments + deployment_jobs epic ( #type/task #status/historical)

## Projects

- [[iotgw-ng]]

## Journal

- [[journal/2026-06-26]] — milestone & task-status snapshot ( #type/milestone)
