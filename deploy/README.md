# deploy/ — Kubernetes deployment

Kustomize manifests + a local `kind` cluster for the iotgw-ng platform. This is
the compose → k8s migration target (see `backlog/decisions/decision-015`).

```
deploy/
  kind/
    cluster.yaml      # kind cluster (1 node, pinned v1.31.12, host-port mappings)
    bootstrap.sh      # up | secrets | deploy | smoke | down
  k8s/
    base/             # platform manifests
      namespace.yaml
      kms/            # Cosmian KMS (StatefulSet + PVC + ConfigMap + Service)
      supabase-db/    # Supabase Postgres (StatefulSet + PVC + init-SQL ConfigMap)
      kestra/         # Kestra server + its Postgres
      whoami/         # demo app behind Ingress (replaces traefik-poc)
      supabase-app/   # Supabase application tier (kong/auth/rest/meta/functions)
    overlays/
      kind/           # local dev: NodePorts mapped to host ports
      prod/           # production sketch (base + supabase-app, real ingress)
```

## Quickstart (local kind)

```bash
# from repo root — needs: kind, kubectl, sops(+age key), ~/.local/bin on PATH
just kind-up         # create cluster + ingress-nginx        (deploy/kind/bootstrap.sh up)
just k8s-deploy      # create Secrets from SOPS + apply kind overlay
just k8s-smoke       # smoke checks
just kind-down       # tear down
```

Host ports (mapped by `kind/cluster.yaml`, same as the compose stacks):

| Host port | Service | via |
|---|---|---|
| 9998 | Cosmian KMS | NodePort 30998 |
| 8080 | Kestra UI/API | NodePort 30808 |
| 5432 | Supabase Postgres | NodePort 30543 |
| 80 / 443 | Ingress (whoami, …) | ingress-nginx |

## Validation status (2026-06-13, kind v1.31.12)

| Component | Status | Evidence |
|---|---|---|
| Cosmian KMS | ✅ **validated** | `curl :9998/version` → `5.20.0` |
| Supabase Postgres | ✅ **validated** | `pg_isready` OK; init-SQL ConfigMap created `supabase_admin`/`authenticator`/`supabase_storage_admin` roles |
| Kestra (+ Postgres) | ✅ **validated** | server `1/1 Ready`, HTTP 200 on `:8080` |
| whoami + ingress-nginx | ✅ **validated** | `curl -H 'Host: whoami.wsl.ymbihq.local' :80` returns whoami |
| Secrets from SOPS | ✅ **validated** | `secrets.sh k8s` → `supabase-env` (62 keys), `kestra-env` (4) Secrets |
| Supabase app tier (kong/auth/rest/meta/functions) | 🟡 **authored, not yet kind-validated** | `base/supabase-app/` — see caveats below |
| Supabase realtime/storage/imgproxy/analytics/supavisor/vector | ⚪ **not migrated** | use the Supabase community Helm chart for the full data plane (decision-015) |

## Known migration caveats (carried from the compose spec)

- **Kestra Docker task runner** (Ansible flows) does **not** work in k8s — the
  flows must move to Kestra's Kubernetes task runner. The Kestra
  webserver/scheduler run fine; the OpenWRT-provisioning flows need the runner
  change before they execute.
- **Kong** needs its declarative config rendered with secret substitution. The
  authored manifest uses an `envsubst` initContainer instead of the compose
  `eval` hack.
- **Supabase realtime** derives its tenant from the container hostname in
  compose — under k8s set the tenant explicitly.
- **vector** scrapes the Docker socket in compose — replace with a
  `kubernetes_logs` source or drop the analytics pipeline.
- **edge functions** are bind-mounted in compose (restart-to-deploy). In k8s,
  bake `volumes/functions` into an image or git-sync it; the authored manifest
  uses an emptyDir placeholder.
- **pg_net webhook URLs** stored in the DB point at `wsl.ymbihq.local:8000`;
  re-run the webhook migrations against the in-cluster Kong Service URL.

For the **full** Supabase data plane in production, prefer the
`supabase-kubernetes` community Helm chart (it mirrors this exact topology) and
feed it values from the SOPS store; keep `kms/`, `kestra/`, and the ingress
from this tree.
