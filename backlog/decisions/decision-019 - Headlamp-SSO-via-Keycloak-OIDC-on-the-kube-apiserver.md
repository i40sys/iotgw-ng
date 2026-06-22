---
id: decision-019
title: Headlamp SSO via Keycloak OIDC on the kube-apiserver
date: '2026-06-22 19:16'
status: accepted
---
## Context

Headlamp (`TASK-063`, [[doc-017]]) initially authenticated operators with a
ServiceAccount bearer token. `kubectl create token` tokens expire (default 1h),
so the dashboard demanded a fresh paste after every config change/restart — and
the alternative, a non-expiring SA token Secret, is a static `cluster-admin`
credential sitting in-cluster and in the browser. We already run **Keycloak at
`iam.joor.net`** (the platform IdP), so real SSO is preferable to any static
token.

Keycloak hosts realm `iotgw` with confidential client `headlamp`. The kind node
can reach `iam.joor.net` over HTTPS and trusts its Let's Encrypt chain (so no
`--oidc-ca-file` is needed). kubeadm on the pinned node (`kindest/node:v1.31.12`)
emits `kubeadm.k8s.io/v1beta3`, where `apiServer.extraArgs` is a **map**.

## Decision

Authenticate Headlamp users with **OIDC against Keycloak**, validated by the
**kube-apiserver itself** (the only way an OIDC id_token becomes an
RBAC-authorized identity):

- **Keycloak** (realm `iotgw`): confidential client `headlamp` (standard flow,
  redirect `http://headlamp.wsl.ymbihq.local/*`), a `groups` membership mapper
  (claim `groups`, names not full-path), a group `k8s-admins`, and login users
  added to it. Client secret lives in SOPS (`secrets/headlamp-oidc.enc.env`).
- **kube-apiserver OIDC flags** (`deploy/kind/cluster.yaml` for reproducibility,
  applied live on the running node):
  `--oidc-issuer-url=https://iam.joor.net/realms/iotgw`,
  `--oidc-client-id=headlamp`, `--oidc-username-claim=preferred_username`,
  `--oidc-username-prefix=oidc:`, `--oidc-groups-claim=groups`,
  `--oidc-groups-prefix=oidc:`. Identities arrive as `oidc:<user>` /
  `oidc:<group>`.
- **RBAC**: `ClusterRoleBinding oidc-k8s-admins` binds Group `oidc:k8s-admins`
  → built-in `cluster-admin` (`deploy/k8s/headlamp/rbac-oidc.yaml`).
- **Headlamp**: started with `-oidc-client-id/-oidc-client-secret/`
  `-oidc-idp-issuer-url/-oidc-scopes` (env-sourced; secret via `secretKeyRef`
  to the `headlamp-oidc` Secret). `/config` then reports `auth_type: oidc` and
  `/oidc` 302-redirects to Keycloak.
- **SA token fallback retained**: the `headlamp` SA → `cluster-admin`
  (`headlamp-admin` binding) stays, so `kubectl -n headlamp create token
  headlamp` still works if the IdP is unreachable.

## Consequences

- **No more token pasting.** Users log in through Keycloak; access is granted by
  realm-group membership (`k8s-admins`), revoked by removing them from it. No
  static credential in the browser.
- **The apiserver is now an OIDC relying party.** Login depends on
  `iam.joor.net` being reachable from both the user's browser and the apiserver.
  The SA fallback covers IdP outages.
- **kind-specific application detail.** The flags are applied two ways: persisted
  in `cluster.yaml` (survives `kind create`) and edited into the live static-pod
  manifest `/etc/kubernetes/manifests/kube-apiserver.yaml` to avoid recreating
  the running cluster. **Gotcha:** values ending in `:` (`oidc:`) must be quoted
  in that manifest's YAML list or the spec becomes invalid and the apiserver
  won't start. A backup is kept at `/etc/kubernetes/kube-apiserver.yaml.pre-oidc.bak`.
- **Prod parity.** A real cluster sets the same apiserver flags via its control
  plane config; only the issuer URL/redirect host differ. The `prod` overlay
  does not yet ship Headlamp.
- Operational runbook (login, token fallback, RBAC widen/narrow, troubleshooting)
  is in [[doc-017]]. Secrets: client secret in SOPS; login + secret mirrored in
  Bitwarden ("Headlamp k8s SSO (Keycloak realm iotgw @ iam.joor.net)").
