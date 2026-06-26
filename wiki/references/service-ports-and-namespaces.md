---
title: Service Ports & Namespaces
category: references
tags: [infra/kubernetes, infra/networking, status/current]
sources:
  - backlog/decisions/decision-020 - Namespace-per-subproject-topology.md
  - backlog/decisions/decision-015 - Kubernetes-Migration-with-local-kind.md
summary: Lookup table of the platform's k8s services — namespace, port, NodePort, and the cross-namespace FQDNs that became load-bearing after the namespace split.
provenance:
  extracted: 0.92
  inferred: 0.03
  ambiguous: 0.05
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Service Ports & Namespaces

Host: `wsl.ymbihq.local`. The kind cluster maps host ports via NodePorts/ingress
(`deploy/kind/cluster.yaml`). One namespace per subproject
([[concepts/namespace-per-subproject]]).

| Service | Namespace | Port | via |
|---|---|---|---|
| Supabase Kong API (edge fns via `/functions/v1/*`) | `supabase-app` | 8000 | NodePort 30800 |
| Supabase Postgres (StackGres primary, direct — no pooler) | `supabase-db` | 5432 | NodePort 30543 |
| Kestra UI/API | `kestra` | 8080 | NodePort 30808 |
| Cosmian KMS | `kms` | 9998 | NodePort 30998 (host path blocked by task-057 NetworkPolicy; reached in-cluster) |
| iotgw-ui frontend (Vite) | `iotgw-ui` | 5173 | NodePort / ingress |
| iotgw-ui backend (tRPC + WS) | `iotgw-ui` | 4444 | NodePort / ingress |
| Ingress HTTP / HTTPS | `supabase-app` / `iotgw-ui` | 80 / 443 | ingress-nginx |
| Headlamp | `headlamp` | 80→4466 | ingress (`headlamp.wsl.ymbihq.local`) |

## Cross-namespace FQDNs (load-bearing)

Cross-namespace calls use `service.namespace.svc.cluster.local`; intra-namespace
calls keep short names.

- `kong.supabase-app.svc.cluster.local:8000`
- `supabase-db.supabase-db.svc.cluster.local:5432`
- `cosmian-kms.kms.svc.cluster.local:9998`
- `kestra.kestra.svc.cluster.local:8080`

## Naming that stays `iotgw` (not the removed namespace)

kind **cluster** `iotgw`, kube-context `kind-iotgw`, `kind load --name iotgw`,
the Keycloak **realm** `iotgw`, and the **Kestra flow namespace** `iotgw-ng`.

> Supabase Studio, realtime, storage, imgproxy, analytics, supavisor and vector
> are intentionally **not deployed** (decision-018, see [[entities/supabase]]).

## Sources

*Original backlog documents this page distills (browsable in-vault via `_sources/`).*

- [[_sources/decisions/decision-020 - Namespace-per-subproject-topology|decision-020 - Namespace-per-subproject-topology]]
- [[_sources/decisions/decision-015 - Kubernetes-Migration-with-local-kind|decision-015 - Kubernetes-Migration-with-local-kind]]
