---
title: Headlamp
category: entities
tags: [infra/kubernetes, secrets/sops, status/current]
relationships:
  - target: "[[entities/keycloak]]"
    type: uses
sources:
  - backlog/decisions/decision-019 - Headlamp-SSO-via-Keycloak-OIDC-on-the-kube-apiserver.md
  - backlog/docs/doc-017 - Headlamp-Kubernetes-Dashboard-Deployment-and-Access.md
summary: The in-cluster Kubernetes web dashboard, in its own headlamp namespace, authenticated via Keycloak OIDC validated by the kube-apiserver (with an SA-token fallback).
provenance:
  extracted: 0.88
  inferred: 0.05
  ambiguous: 0.07
base_confidence: 0.7
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Headlamp

**Headlamp** is the in-cluster Kubernetes web UI (`ghcr.io/headlamp-k8s/headlamp:v0.30.0`),
added in TASK-063. It lives in its **own `headlamp` namespace** as a
**self-contained kustomization** (`deploy/k8s/headlamp/`) — the pattern that the
later namespace-per-subproject split adopted platform-wide
([[concepts/namespace-per-subproject]]). Reached at
`http://headlamp.wsl.ymbihq.local/` (Pi-hole CNAME → the WSL host).

## Authentication — Keycloak OIDC on the kube-apiserver

Primary auth is **OIDC against Keycloak** (realm `iotgw` at `iam.joor.net`),
validated by the **kube-apiserver itself** — the only way an OIDC id_token
becomes an RBAC identity ([[entities/keycloak]], decision-019):

- Keycloak confidential client `headlamp` + a `groups` mapper + group
  `k8s-admins`; client secret in SOPS (`secrets/headlamp-oidc.enc.env`).
- kube-apiserver OIDC flags (`--oidc-issuer-url=https://iam.joor.net/realms/iotgw`,
  `--oidc-client-id=headlamp`, username/groups claims with prefix `oidc:`).
- RBAC: `ClusterRoleBinding oidc-k8s-admins` binds Group `oidc:k8s-admins` →
  built-in `cluster-admin`.
- **SA token fallback** retained for IdP outages (`kubectl -n headlamp create
  token headlamp`).

## Gotchas (verified end-to-end)

- `OIDC_SCOPES` must be `profile,email` — Headlamp auto-prepends `openid` (a
  duplicate trips Keycloak's `invalid_scope`), and `groups` comes from the client
  mapper, not a scope. A wrong scope surfaces as the misleading downstream
  `invalid_grant / Code not valid`.
- kind-specific: apiserver flags are applied both in `cluster.yaml` and edited
  into the live static-pod manifest; **values ending in `:` (`oidc:`) must be
  quoted** in that YAML list or the apiserver won't start.

## Sources

- decision-019 (Headlamp SSO via Keycloak OIDC), doc-017 (deployment & access runbook).
- Related: [[entities/keycloak]], [[concepts/namespace-per-subproject]], [[entities/ingress-nginx]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/decisions/decision-019 - Headlamp-SSO-via-Keycloak-OIDC-on-the-kube-apiserver|decision-019 - Headlamp-SSO-via-Keycloak-OIDC-on-the-kube-apiserver]]
- [[_sources/docs/doc-017 - Headlamp-Kubernetes-Dashboard-Deployment-and-Access|doc-017 - Headlamp-Kubernetes-Dashboard-Deployment-and-Access]]
