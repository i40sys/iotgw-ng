# iotgw-ng on OVH Managed Kubernetes (`ymbihq`, GRA9)

The real environment (task-142). kind stays as the dev cluster.

| | |
|---|---|
| Cluster | existing OVH MKS `ymbihq` (free control plane, GRA9) — **imported**, `prevent_destroy` |
| Worker | node pool `iotgw`: 1 × `r3-16` (2 vCPU / 16 GB — the stack is memory-bound) |
| Edge | the cluster's Traefik (Gateway API, LB `145.239.127.187`, owned by `~/k8s`); iotgw adds its own Gateway `iotgw-gateway/iotgw` |
| DNS | Cloudflare `i40sys.com`, DNS-only A records → the Traefik LB |
| State | OVH Object Storage S3, bucket `iotgw-ng-tfstate-28f191` (versioned, lockfile) |
| Secrets | `secrets/ovh.enc.env` (OVH API, S3, Cloudflare) + the usual SOPS files |

| Host | Serves |
|---|---|
| `https://iotgw.i40sys.com` | SPA (Let's Encrypt) |
| `https://backend.iotgw.i40sys.com` | iotgw-ui backend, tRPC + WS (Let's Encrypt) |
| `https://api.iotgw.i40sys.com` | Supabase via Kong — operator login (Let's Encrypt) |
| `https://device.iotgw.i40sys.com` | only `/functions/v1/{vpn,ssh-ca}`; cert from the **device-API CA** the gateways pin (decision-035), issued by Terraform |

## Layout

```
tf.sh            sops exec-env wrapper: tf.sh <infra|platform|bootstrap> <terraform args>
bootstrap/       protections on the state bucket itself (task-143)
infra/           OVH: cluster import, node pool, Cloudflare records
platform/        k8s: StackGres operator (helm), Secrets from SOPS, device-API
                 cert, and deploy/k8s/overlays/ovh (kbst/kustomization)
```

Two root modules because the Kubernetes providers need the cluster to exist;
`platform` reads the kubeconfig from the `infra` state.

## State bucket security (task-143)

`platform` state holds the k8s Secrets in plaintext (decision in task-143: keep
them in Terraform, lock the bucket down). `bootstrap/` manages:

- **Access:** only the dedicated S3 user `iotgw-ng-terraform-state` (OVH user
  815403), whose S3 policy allows `s3:*` on this bucket only. OVH S3 has **no
  bucket policies / Public Access Block** (`NotImplemented`); buckets belong to
  their owner, the ACL is owner-only, and another project S3 user is denied
  list/get/put (verified with a temporary probe user, 2026-09-29).
- **At rest:** SSE AES256 default; existing state objects rewritten encrypted.
- **Retention:** versioning on; noncurrent versions expire after 30 days
  (older unencrypted versions age out the same way).

Anyone holding the OVH project API credential can still create users and grant
access — that credential is the trust root (SOPS, `secrets/ovh.enc.env`).

## Use

```bash
deploy/terraform/ovh/tf.sh infra plan      # / apply
deploy/terraform/ovh/tf.sh platform plan   # / apply
# kubectl: ~/k8s/clusters/ovh-ymbihq/kubeconfig.yml (context ovh-ymbihq)
```

Not Terraform's job (one-off / runtime operations, reuse `deploy/kind/bootstrap.sh`
against the OVH kubeconfig):

```bash
export KUBECONFIG=~/k8s/clusters/ovh-ymbihq/kubeconfig.yml
deploy/kind/bootstrap.sh migrate      # app schema (fresh DB only)
deploy/kind/bootstrap.sh sync-roles   # after rotating POSTGRES_PASSWORD
```

## Release → OVH

1. Tag `vX.Y.Z` (deploy/RELEASE.md). The frontend is built with the repo variables
   `PROD_VITE_API_URL=https://backend.iotgw.i40sys.com/`,
   `PROD_VITE_SUPABASE_URL=https://api.iotgw.i40sys.com`, `PROD_VITE_SUPABASE_ANON_KEY`.
2. Pin the three digests in `deploy/k8s/overlays/ovh/kustomization.yaml`.
3. `tf.sh platform apply`.

## Versions (kept equal to kind)

- StackGres operator **1.19.1** (1.17.x charts stop at k8s 1.34; OVH runs 1.35).
- Cosmian KMS **5.27.1** (5.20.0's `/etc/passwd` is a `/nix/store` symlink that
  containerd 2.2 refuses: `openat etc/passwd: path escapes from parent`).
- Kubernetes: OVH 1.35 (`ALWAYS_UPDATE`); kind still 1.31 (needs a cluster recreate).

## Migration from kind (2026-09-29)

App data (`public` + `auth.users/identities`, restored with
`session_replication_role=replica` so no Netmaker webhook fired), the KMS SQLite
store (same `iotgw_api_token` → same `KMS_AUTH_TOKEN`) and Kestra (DB + `/app/storage`,
incl. KV). Backups: `~/.local/share/iotgw-migration/2026-09-29/` (0700, contains keys).
kind's Kestra is scaled to 0 so schedules don't run twice.

**Gateways** must be re-pointed to the new device API (the CA is unchanged):
`uci set iotgw.main.api_base='https://device.iotgw.i40sys.com' && uci commit iotgw`.
