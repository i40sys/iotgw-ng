---
title: ingress-nginx
category: entities
tags: [infra/ingress, infra/networking, status/current]
relationships:
  - target: "[[concepts/kubernetes-migration-kind]]"
    type: related_to
sources:
  - backlog/decisions/decision-015 - Kubernetes-Migration-with-local-kind.md
  - backlog/decisions/decision-013 - Monorepo-Organization-Single-Repo-with-Logical-Grouping.md
  - backlog/docs/doc-017 - Headlamp-Kubernetes-Dashboard-Deployment-and-Access.md
summary: The Ingress controller (its own isolated namespace) that terminates TLS and routes HTTP(S) 80/443; replaced the removed traefik-poc docker-compose PoC.
provenance:
  extracted: 0.85
  inferred: 0.07
  ambiguous: 0.08
base_confidence: 0.5
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: peripheral
created: 2026-06-26
updated: 2026-06-26
---

# ingress-nginx

**ingress-nginx** is the Kubernetes Ingress controller for the platform. It
**replaced the former `traefik-poc/` docker-compose PoC** — the docker-provider
PoC did not translate to k8s, so TLS termination is now realized by the k8s
Ingress (decision-015, decision-013).

## Role

- Routes HTTP/HTTPS (80/443) to the in-cluster Services by Host header (e.g.
  `iotgw-ui`, `headlamp.wsl.ymbihq.local`).
- **TLS terminates at the Ingress** (certs minted by `kms/pki-test/`); prod uses
  Traefik CRDs/Gateway API.
- Runs in its **own isolated namespace** and is **not** touched by the
  namespace-per-subproject split ([[concepts/namespace-per-subproject]]).
- An Ingress can only use a TLS Secret in its own namespace, so the wildcard
  `iotgw-wildcard-tls` Secret is replicated into each Ingress namespace
  (`supabase-app`, `iotgw-ui`).

## Sources

*Original backlog documents this page distills (browsable in-vault via `_sources/`).*

- [[_sources/decisions/decision-015 - Kubernetes-Migration-with-local-kind|decision-015 - Kubernetes-Migration-with-local-kind]]
- [[_sources/decisions/decision-013 - Monorepo-Organization-Single-Repo-with-Logical-Grouping|decision-013 - Monorepo-Organization-Single-Repo-with-Logical-Grouping]]
- [[_sources/docs/doc-017 - Headlamp-Kubernetes-Dashboard-Deployment-and-Access|doc-017 - Headlamp-Kubernetes-Dashboard-Deployment-and-Access]]
