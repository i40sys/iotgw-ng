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
| `ServiceAccount` | `headlamp` | The identity Headlamp authenticates users against |
| `ClusterRoleBinding` | `headlamp-admin` | Binds the SA to the built-in `cluster-admin` ClusterRole |
| `Deployment` | `headlamp` | `ghcr.io/headlamp-k8s/headlamp:v0.30.0`, args `-in-cluster -plugins-dir=/headlamp/plugins`, container port `4466`, liveness/readiness probes on `/` |
| `Service` | `headlamp` | ClusterIP `:80 → 4466` |
| `Ingress` | `headlamp` | `ingressClassName: nginx`, host `headlamp.wsl.ymbihq.local`, path `/` |

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

### Login token

Headlamp runs `-in-cluster`, so the login screen expects a **Kubernetes
ServiceAccount bearer token**. Mint a short-lived one (TokenRequest API, default
1h TTL):

```bash
kubectl -n headlamp create token headlamp
# longer-lived, e.g. 8h:
kubectl -n headlamp create token headlamp --duration=8h
```

Paste the output into the Headlamp login prompt. The token carries the
`headlamp` SA's permissions (`cluster-admin` — full read-write, see below).

> Tokens are **not stored** anywhere — they are generated on demand and expire.
> There is no static Secret token to leak; re-run the command whenever you need
> a fresh one.

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

## Validation (kind v1.31.12, 2026-06-22)

- Pod `1/1 Ready` in namespace **`headlamp`** (nothing left in `iotgw`).
- `ClusterRoleBinding headlamp-admin` subject `headlamp/headlamp` → `cluster-admin`.
- `curl http://headlamp.wsl.ymbihq.local/` → **HTTP 200**; `/config` reports the
  in-cluster cluster (`source: incluster`).
- Pi-hole resolves `headlamp.wsl.ymbihq.local` → `wsl.ymbihq.local` → host IP.
- `kubectl -n headlamp create token headlamp` mints a working login token.

## References

- Task: `TASK-063` — Deploy Headlamp Kubernetes dashboard into the kind cluster
- Manifests: `deploy/k8s/headlamp/`
- Apply hook: `deploy/kind/bootstrap.sh` (`deploy` step)
- Deploy overview: `deploy/README.md` (§ Headlamp dashboard)
- DNS: `skill-pihole-dns` skill (Pi-hole v6 `10.2.10.27`)
- Upstream: <https://headlamp.dev>
