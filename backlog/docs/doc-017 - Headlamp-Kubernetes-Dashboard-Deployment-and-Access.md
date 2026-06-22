---
id: doc-017
title: Headlamp Kubernetes Dashboard Deployment and Access
type: guide
created_date: '2026-06-22 16:09'
---

# Headlamp Kubernetes Dashboard — Deployment & Access

Operational runbook for [Headlamp](https://headlamp.dev), the in-cluster
Kubernetes web UI added to the iotgw-ng platform (`TASK-063`). Covers **how it
is deployed**, **why it lives in its own namespace**, and **how to obtain a
login token**.

## TL;DR

```bash
# Deploy (idempotent; also runs automatically as part of `just k8s-deploy`)
kubectl apply -k deploy/k8s/headlamp

# Get a login token (short-lived, default 1h)
kubectl -n headlamp create token headlamp

# Open the UI and paste the token at the login prompt
#   http://headlamp.wsl.ymbihq.local/
```

## What gets deployed

Manifests live in **`deploy/k8s/headlamp/`** (`headlamp.yaml` +
`kustomization.yaml`) — a **self-contained kustomization**, not part of the
`base/` tree or the `overlays/kind` overlay.

| Resource | Name | Notes |
|---|---|---|
| `Namespace` | `headlamp` | Dedicated namespace (see below) |
| `ServiceAccount` | `headlamp` | Pod identity + token-login fallback |
| `ClusterRoleBinding` | `headlamp-admin` | SA → `cluster-admin` (token fallback) |
| `ClusterRoleBinding` | `oidc-k8s-admins` | Keycloak group `oidc:k8s-admins` → `cluster-admin` (`rbac-oidc.yaml`) |
| `Secret` | `headlamp-oidc` | OIDC client secret from SOPS (`bootstrap.sh secrets`) — not in the kustomization |
| `Deployment` | `headlamp` | `ghcr.io/headlamp-k8s/headlamp:v0.30.0`, args `-in-cluster` + `-oidc-*`, container port `4466`, probes on `/` |
| `Service` | `headlamp` | ClusterIP `:80 → 4466` |
| `Ingress` | `headlamp` | `ingressClassName: nginx`, host `headlamp.wsl.ymbihq.local`, path `/` |

OIDC SSO (Keycloak + kube-apiserver) is the primary auth path — see
[[decision-019]] and **Login — OIDC SSO** below.

## Why a dedicated `headlamp` namespace (mandatory)

The iotgw platform's kustomizations (`base/kustomization.yaml`,
`overlays/kind/kustomization.yaml`) set `namespace: iotgw`. Kustomize's namespace
transformer is **unconditional**: any resource routed through those
kustomizations — including a `Namespace` object — is rewritten to `iotgw`. So a
component cannot declare its own namespace *and* be included under the iotgw
overlay; the parent always wins.

To keep Headlamp **isolated from the application namespace**, it is therefore
applied as a **standalone kustomization** with its own `namespace: headlamp`
transformer and a `Namespace` resource it creates itself. `deploy/kind/bootstrap.sh`
applies it with a second `kubectl apply -k deploy/k8s/headlamp` right after the
overlay, so `just k8s-deploy` provisions it automatically.

> Isolation rationale: the dashboard is a cluster-wide operations tool with a
> `cluster-admin` identity — keeping it out of the app namespace separates its
> blast radius and RBAC from the workload tier, and makes it trivial to remove
> (`kubectl delete -k deploy/k8s/headlamp` / `kubectl delete ns headlamp`).

## Access (DNS + login token)

### DNS

`headlamp.wsl.ymbihq.local` resolves network-wide via a **Pi-hole CNAME** →
`wsl.ymbihq.local` (A → the WSL host), matching the other kind ingress
hostnames (`whoami`, `iotgw-ui`, …). Pi-hole v6 at `10.2.10.27`, managed with
the `skill-pihole-dns` skill:

```bash
# add the alias (one-time; already done for headlamp)
python scripts/manage_record.py add CNAME headlamp.wsl.ymbihq.local wsl.ymbihq.local
```

If resolving from a host that does not use Pi-hole, add a hosts entry instead:
`<wsl-ip>  headlamp.wsl.ymbihq.local`.

### Login — OIDC SSO (primary)

Headlamp authenticates users via **Keycloak OIDC** (realm `iotgw` at
`iam.joor.net`, [[decision-019]]). There is **nothing to paste**:

1. Open <http://headlamp.wsl.ymbihq.local/> → click **Sign in**.
2. You are redirected to Keycloak; log in (realm `iotgw`, e.g. user `oriol`).
3. Back in Headlamp you are `oidc:<preferred_username>`, authorized by your
   `k8s-admins` group → `cluster-admin`.

Access is granted/revoked purely by **realm-group membership** (`k8s-admins`).
The browser holds only the short-lived OIDC id_token, refreshed by the IdP.

Why this needs apiserver config: the id_token Headlamp gets is sent straight to
the kube-apiserver, so the **apiserver** is the OIDC relying party (flags in
`deploy/kind/cluster.yaml`); Headlamp just drives the browser redirect. Confirm
it's live:

```bash
curl -s http://headlamp.wsl.ymbihq.local/config | jq '.clusters[0].auth_type'   # "oidc"
curl -s -o /dev/null -D - 'http://headlamp.wsl.ymbihq.local/oidc?cluster=main' | grep -i location
# -> 302 https://iam.joor.net/realms/iotgw/protocol/openid-connect/auth?client_id=headlamp...
```

### Login — SA token (fallback)

If Keycloak is unreachable, a ServiceAccount token still works (the `headlamp`
SA is bound to `cluster-admin`):

```bash
kubectl -n headlamp create token headlamp          # default 1h
kubectl -n headlamp create token headlamp --duration=8h
```

Paste it at the login prompt. Tokens are minted on demand and expire — there is
no static Secret token to leak.

### Managing OIDC users (Keycloak)

```bash
# admin token (admin pw in Bitwarden "iam.joor.net")
TOK=$(curl -s https://iam.joor.net/realms/master/protocol/openid-connect/token \
  -d client_id=admin-cli -d username=admin --data-urlencode "password=$KCADMIN" \
  -d grant_type=password | jq -r .access_token)
# add a user to the k8s-admins group (grants cluster-admin):
#   create the user, then PUT /admin/realms/iotgw/users/<id>/groups/<k8s-admins-id>
```

Realm `iotgw`, client `headlamp`, group `k8s-admins`. The client secret lives in
SOPS (`secrets/headlamp-oidc.enc.env`) and Bitwarden ("Headlamp k8s SSO …").

## RBAC — read-write by default

The `headlamp-admin` ClusterRoleBinding binds the SA to the **built-in
`cluster-admin`** ClusterRole, so the dashboard can view **and modify** every
resource in the cluster.

To make Headlamp **read-only**, repoint the binding's `roleRef` at a
get/list/watch ClusterRole (e.g. the built-in `view`, or a custom
`get`/`list`/`watch`-on-`*` role) and re-apply:

```yaml
# deploy/k8s/headlamp/headlamp.yaml — ClusterRoleBinding roleRef
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: view          # was: cluster-admin
```

Verify the effective permissions of the SA token directly (avoids the
client-cert-precedence pitfall of `kubectl auth can-i --token`):

```bash
TOKEN=$(kubectl -n headlamp create token headlamp)
API=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')
curl -sk "$API/apis/authorization.k8s.io/v1/selfsubjectaccessreviews" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"spec":{"resourceAttributes":{"verb":"delete","resource":"pods"}}}' \
  | grep -o '"allowed": *[a-z]*'
```

## Operations

```bash
# status
kubectl -n headlamp get all,ingress

# logs
kubectl -n headlamp logs deploy/headlamp -f

# pin/upgrade the image: edit the Deployment image tag in headlamp.yaml, then
kubectl apply -k deploy/k8s/headlamp
kubectl -n headlamp rollout status deploy/headlamp

# remove entirely
kubectl delete -k deploy/k8s/headlamp     # also deletes the namespace
```

## Troubleshooting

- **`/oidc` returns 200, not 302 / `auth_type` not `oidc`** — the Headlamp
  container didn't get the OIDC args. Check the `headlamp-oidc` Secret exists in
  the namespace and the env expanded: `docker exec iotgw-control-plane sh -c
  'tr "\0" "\n" < /proc/$(pgrep -f headlamp-server)/cmdline | grep oidc'`.
- **Login redirects but k8s calls are 401/403** — the apiserver isn't OIDC-aware
  or RBAC isn't bound. Verify `--oidc-*` on the running apiserver and that
  `SelfSubjectReview` with a realm id_token returns `oidc:<user>` +
  `oidc:k8s-admins`; confirm the `oidc-k8s-admins` ClusterRoleBinding exists.
- **apiserver won't start after editing the static manifest** — a flag value
  ending in `:` (e.g. `oidc:`) must be **quoted** in the YAML list. Restore
  `/etc/kubernetes/kube-apiserver.yaml.pre-oidc.bak` and re-apply quoted.
- **Keycloak unreachable** — use the SA token fallback (above).

## Validation (kind v1.31.12, 2026-06-22)

- Pod `1/1 Ready` in namespace **`headlamp`** (nothing left in `iotgw`).
- Pi-hole resolves `headlamp.wsl.ymbihq.local` → `wsl.ymbihq.local` → host IP;
  `curl http://headlamp.wsl.ymbihq.local/` → **HTTP 200**.
- **OIDC**: `/config` → `auth_type: oidc`; `/oidc?cluster=main` → **302** to
  `iam.joor.net/realms/iotgw/.../auth?client_id=headlamp`.
- **apiserver** authenticates a realm id_token: `SelfSubjectReview` →
  `username: oidc:oriol`, `groups: [oidc:k8s-admins, system:authenticated]`.
- **RBAC**: as `oidc:oriol`, SSAR `list/delete pods`, `create namespaces`,
  `update deployments` all → `allowed: true` (via group → cluster-admin).
- SA token fallback: `kubectl -n headlamp create token headlamp` still works.

## References

- Decision: [[decision-019]] — Headlamp SSO via Keycloak OIDC on the kube-apiserver
- Task: `TASK-063` — Deploy Headlamp Kubernetes dashboard into the kind cluster
- Manifests: `deploy/k8s/headlamp/` (`headlamp.yaml`, `rbac-oidc.yaml`)
- apiserver OIDC flags: `deploy/kind/cluster.yaml`
- Apply hook: `deploy/kind/bootstrap.sh` (`deploy` step)
- Secrets: `secrets/headlamp-oidc.enc.env` (SOPS); Bitwarden "Headlamp k8s SSO …"
- Deploy overview: `deploy/README.md` (§ Headlamp dashboard)
- DNS: `skill-pihole-dns` skill (Pi-hole v6 `10.2.10.27`)
- Upstream: <https://headlamp.dev>
