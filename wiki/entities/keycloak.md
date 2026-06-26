---
title: Keycloak
category: entities
tags: [infra/kubernetes, secrets/sops, status/current]
relationships:
  - target: "[[entities/headlamp]]"
    type: related_to
sources:
  - backlog/decisions/decision-019 - Headlamp-SSO-via-Keycloak-OIDC-on-the-kube-apiserver.md
  - backlog/docs/doc-017 - Headlamp-Kubernetes-Dashboard-Deployment-and-Access.md
summary: The platform IdP at iam.joor.net hosting realm iotgw; provides OIDC SSO for Headlamp via the kube-apiserver. Note "iotgw realm" is unrelated to the iotgw cluster/namespace naming.
provenance:
  extracted: 0.85
  inferred: 0.07
  ambiguous: 0.08
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: peripheral
created: 2026-06-26
updated: 2026-06-26
---

# Keycloak

**Keycloak** is the platform Identity Provider, hosted at **`iam.joor.net`**. It
hosts realm **`iotgw`** with the confidential client `headlamp`.

## Role

- Provides **OIDC SSO** for [[entities/headlamp]] — the kube-apiserver is
  configured as the OIDC relying party so a Keycloak id_token becomes an
  RBAC-authorized k8s identity (`oidc:<user>` / `oidc:<group>`).
- Access to the cluster dashboard is granted/revoked purely by **realm-group
  membership** (`k8s-admins` → `cluster-admin`).
- The kind node trusts `iam.joor.net`'s Let's Encrypt chain, so no
  `--oidc-ca-file` is needed.

> [!note] Naming overlap
> The Keycloak **realm** `iotgw` is distinct from the kind **cluster** `iotgw`
> and the (now-removed) k8s namespace `iotgw` — all three reuse the name but are
> different things ([[concepts/namespace-per-subproject]]).

Admin password and the Headlamp client secret are in Bitwarden / SOPS
(`secrets/headlamp-oidc.enc.env`).

## Sources

*Original backlog documents this page distills (browsable in-vault via `_sources/`).*

- [[_sources/decisions/decision-019 - Headlamp-SSO-via-Keycloak-OIDC-on-the-kube-apiserver|decision-019 - Headlamp-SSO-via-Keycloak-OIDC-on-the-kube-apiserver]]
- [[_sources/docs/doc-017 - Headlamp-Kubernetes-Dashboard-Deployment-and-Access|doc-017 - Headlamp-Kubernetes-Dashboard-Deployment-and-Access]]
