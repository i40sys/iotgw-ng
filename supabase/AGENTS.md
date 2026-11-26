# supabase/ — Self-hosted Supabase App Tier

Guidance for agents working in `supabase/`.

## Overview

This is the self-hosted Supabase app tier for the iotgw-ng project (IoT Gateway
Next Generation), **deployed on Kubernetes** (`decision-017` made k8s the sole
supported runtime, retiring the former compose stack). The real environment is
**OVH** (`deploy/k8s/overlays/ovh`, images pulled from `ghcr.io/i40sys/*` pinned
by `@sha256` digest); the local `kind` cluster is for development. The
running stack is a trimmed set of stateless Deployments — Kong, GoTrue (auth),
PostgREST (rest), postgres-meta, and the Deno edge runtime (functions) — sitting
in front of a StackGres-managed PostgreSQL tier (`decision-018`). It provides
backend-as-a-service capabilities: PostgreSQL database, authentication, REST API,
and edge functions.

This `supabase/` directory remains the source of the edge-function code and the
Kong declarative config; the deployment itself is driven from `deploy/` (see
[deploy/README.md](../deploy/README.md)). The DB init SQL is **not** sourced from
here: the StackGres SGScript loads `deploy/k8s/base/supabase-db-stackgres/sql/`.
`volumes/db/*.sql` and `volumes/pooler/` are compose-era leftovers kept for
reference only.

`.claude/skills/` (setup-realtime, setup-storage-bucket, …) partly covers services
that are not deployed (`decision-018`).

## Architecture

### Core Services

The app tier runs as Deployments in the `supabase-app` namespace; the DB tier
lives in its own `supabase-db` namespace (`decision-020`). Manifests live in
[`deploy/k8s/base/supabase-app/`](../deploy/k8s/base/supabase-app/), applied via
the kustomize overlays (`deploy/k8s/overlays/{kind,prod}`):

- **db (supabase-db)**: a **StackGres `SGCluster` named `supabase-db`** (PG 15,
  `decision-018`), NOT the bundled compose Postgres image.
  - Init SQL (roles, the `SECURITY DEFINER` webhook fn, the event trigger, JWT
    GUCs) is a StackGres `SGScript` loading `deploy/k8s/base/supabase-db-stackgres/sql/`
  - Data persisted on a StackGres-managed PVC (Patroni-managed)
  - `disableConnectionPooling: true` → clients hit the **direct primary** at
    `supabase-db.supabase-db.svc.cluster.local:5432` (cross-namespace FQDN,
    `decision-020`); there is **no supavisor pooler and no :6543**
  - The hand-authored `supabase-db` StatefulSet under `deploy/k8s/base/supabase-db/`
    is retained only as the documented NO-GO rollback and is not deployed

- **supavisor (pooler)**: *intentionally not deployed on k8s (`decision-018` §4).*
  Transaction pooling would change prepared-statement / `SET ROLE` semantics the
  app tier has never been tested against, so clients use the direct primary above
  (no :5432-via-pooler, no :6543).

- **auth (GoTrue)**: GoTrue authentication service — **deployed**
  - Handles user authentication, JWT tokens, email/phone verification
  - Supports OAuth providers, magic links, password auth
  - Configured via keys of the `supabase-env` Secret (see `deploy/k8s/base/supabase-app/auth.yaml`)

- **rest (PostgREST)**: PostgREST for automatic REST API generation — **deployed**
  - Auto-generates REST endpoints from PostgreSQL schemas
  - Configured schemas trimmed to `public` (`PGRST_DB_SCHEMAS`; storage/graphql
    schemas dropped with their services)

- **realtime**: *intentionally not deployed on k8s (`decision-018` §4).* The
  compose-era tenant-from-hostname quirk is moot.

- **storage / imgproxy**: *intentionally not deployed on k8s (`decision-018` §4).*
  Object storage and image transformation are not part of the running stack.

- **functions (edge runtime)**: Deno-based edge runtime — **deployed**
  - Function source lives in volumes/functions/ but is **baked into an image**
    (not bind-mounted — see Edge Functions Development below):
    `iotgw-functions:local` on kind, `ghcr.io/i40sys/iotgw-functions@sha256:…` on
    OVH/prod (the base manifest names `supabase/edge-runtime:v1.74.0`; overlays
    replace it)
  - Main routing function in volumes/functions/main/index.ts handles JWT verification and dispatches to specific functions
  - Custom function netmaker-call handles live device/network provisioning via direct Netmaker REST (the legacy kestra-call edge functions have been removed)
  - `vpn` and `ssh-ca` serve the gateways (VPN config, SSH host certificates)

- **kong**: API gateway routing services through port 8000 — **deployed**
  - Declarative config from volumes/api/kong.yml, rendered with secret
    substitution by an `envsubst` initContainer (replacing the compose `eval` hack)
  - Handles request routing, authentication, CORS
  - Exposed as NodePort 30800 → host port 8000

- **studio**: *intentionally not deployed on k8s (`decision-018` §4).* There is
  no Studio UI on the running cluster.

- **analytics (logflare)**: *intentionally not deployed on k8s (`decision-018` §4).*

- **meta (postgres-meta)**: Database metadata API — **deployed**

- **vector**: *intentionally not deployed on k8s (`decision-018` §4).* The
  compose-era Docker-socket scraping is moot.

### Key Architecture Patterns

1. **Workload model**: the app tier is a set of stateless Deployments in the
   `supabase-app` namespace; the DB tier is a StackGres `SGCluster` in the
   `supabase-db` namespace (`decision-020`). Bring-up, teardown, and readiness
   are managed by k8s, not compose `depends_on`.
2. **Internal Networking**: app-tier services reach each other **intra-namespace**
   by short Service name (e.g. `http://kong:8000` inside `supabase-app`); the DB
   is **cross-namespace** at the FQDN `supabase-db.supabase-db.svc.cluster.local:5432`
   (`decision-020`)
3. **Environment Configuration**: keys of the `supabase-env` k8s Secret,
   generated from `secrets/supabase.enc.env` (SOPS+age, decision-014) — JWT_SECRET,
   POSTGRES_PASSWORD, API keys, etc. There is **no `envFrom`**: each manifest
   maps the keys it needs one by one (`secretKeyRef`), so a new SOPS key also
   needs a manifest entry
4. **Persistence**: the StackGres-managed PVC holds DB data; the dropped
   data-plane services (storage/etc.) carried the only other volumes
5. **Edge Functions Main Router**: The main function acts as a dispatcher that verifies JWT tokens and routes requests to specific edge functions by path

### Custom Edge Functions

The deployment includes custom Deno edge functions in volumes/functions/:

- **netmaker-call**: CURRENT live webhook target for both 'devices' AND 'networks' tables
  - Provisions devices/networks directly against the Netmaker REST API (no Kestra in the loop)
  - This is what the DB AFTER INSERT/UPDATE triggers point at today
  - Located at: volumes/functions/netmaker-call/index.ts

- **main**: Central routing function for all edge functions
  - JWT verification when VERIFY_JWT=true
  - Routes requests to specific functions based on path (/function-name)
  - Worker creation with configurable memory limits and timeouts
  - Located at: volumes/functions/main/index.ts

- **vpn**, **ssh-ca**: called by the gateways (one-time-code auth, WireGuard
  config, SSH host certificates) — see [volumes/functions/AGENTS.md](volumes/functions/AGENTS.md)

- Other functions: hello, martin (examples / smoke tests). The iPXE functions
  (about.ipxe, menu.ipxe) were removed (task-101).

## Common Commands

All commands run from the **repo root** against the local `kind` cluster (dev).
OVH is applied with Terraform (`deploy/terraform/ovh/README.md`).

### Starting/Stopping Services

```bash
# Bring the whole platform up (create cluster + deploy + smoke + e2e)
just bootstrap        # = just kind-up + just k8s-deploy + just k8s-smoke + just e2e

# Tear the cluster down (removes the cluster and all its data)
just kind-down
```

> A full reset is `just kind-down` followed by `just bootstrap` (the compose-era
> `reset.sh` helper was removed with the docker-compose decommission, `decision-017`).

### Service Management

```bash
# View logs for a service (Deployment) in the supabase-app namespace
kubectl -n supabase-app logs -f deploy/functions
# Examples: functions, kong, auth, rest, meta

# Restart (roll) a service — picks up new image / Secret values
kubectl -n supabase-app rollout restart deploy/<name>

# Check service health (pod status)
kubectl -n supabase-app get pods
```

### Database Operations

The DB is a StackGres SGCluster; psql runs inside the primary pod's `patroni`
container. Resolve the primary pod first:

```bash
# Resolve the StackGres primary pod
PG=$(kubectl -n supabase-db get pod -l 'stackgres.io/cluster-name=supabase-db,role=master' \
       -o jsonpath='{.items[0].metadata.name}')

# Connect to PostgreSQL (interactive)
kubectl -n supabase-db exec -it "$PG" -c patroni -- psql -U postgres -d postgres

# Apply the iotgw-ui migration set (fresh DB only — skips when public.devices exists)
deploy/kind/bootstrap.sh migrate   # schema source: iotgw-ui/supabase/migrations/

# Backup database
kubectl -n supabase-db exec "$PG" -c patroni -- pg_dump -U postgres postgres > backup.sql

# Restore database
kubectl -n supabase-db exec -i "$PG" -c patroni -- psql -U postgres postgres < backup.sql
```

### Edge Functions Development

```bash
# Edge functions are in volumes/functions/ but are BAKED INTO the
# iotgw-functions:local image on kind (not bind-mounted).

# To add a new function:
# 1. Create a directory in volumes/functions/
# 2. Add index.ts with Deno serve() handler
# 3. Rebuild + load the image, then roll the Deployment:
deploy/kind/bootstrap.sh functions          # docker build + kind load
kubectl -n supabase-app rollout restart deploy/functions
# (just k8s-deploy does this build+load as part of a full apply)

# Test edge function (Kong NodePort → host :8000)
curl -X POST http://localhost:8000/functions/v1/<function-name> \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"key":"value"}'

# View function logs
kubectl -n supabase-app logs -f deploy/functions
```

### Accessing Services

- **Supabase Studio**: *not deployed* on k8s (`decision-018` §4) — there is no
  Studio UI on the running cluster
- **API Gateway (Kong)**: http://wsl.ymbihq.local:8000 (NodePort 30800 → host
  8000; edge fns via `/functions/v1/*`)
- **Database**: localhost:5432 → the **direct primary**
  `supabase-db.supabase-db.svc.cluster.local:5432` (NodePort 30543; no supavisor
  pooler, no :6543)
- **Analytics**: *not deployed* on k8s (`decision-018` §4)

## Configuration

### Environment Variables

Configuration is delivered to the pods from the `supabase-env` k8s Secret,
created from `secrets/supabase.enc.env` by `deploy/kind/bootstrap.sh secrets`
(`make_secrets`). There is **no `envFrom`**: each Deployment under
`deploy/k8s/base/supabase-app/` maps single keys with `secretKeyRef` (or sets a
literal `value:`). Key variables:

> Note: real secret values live encrypted in `secrets/supabase.enc.env` (SOPS+age, decision-014).
> To change an env/secret var: edit the SOPS store (`just secrets-edit supabase`),
> re-run `deploy/kind/bootstrap.sh secrets` to refresh the `supabase-env` Secret,
> then `kubectl -n supabase-app rollout restart deploy/<name>` so the consumer picks it up.
> A **new** key also needs an `env:` entry in the consumer's manifest (e.g.
> `functions.yaml`), or the pod never sees it.

**Security** (must change for production):
- JWT_SECRET: JWT signing key (min 32 chars)
- POSTGRES_PASSWORD: Database password
- ANON_KEY / SERVICE_ROLE_KEY: API keys (generate with JWT_SECRET)
- DASHBOARD_USERNAME / DASHBOARD_PASSWORD: still substituted into `kong.yml`
  (Studio itself is not deployed)

**Database**:
- POSTGRES_HOST=supabase-db.supabase-db.svc.cluster.local (the StackGres primary Service in the `supabase-db` namespace, reached cross-namespace by the app tier — `decision-020`)
- POSTGRES_DB=postgres
- POSTGRES_PORT=5432 (direct primary; no pooler)

**API Configuration**:
- KONG_HTTP_PORT=8000
- KONG_HTTPS_PORT=8443
- PGRST_DB_SCHEMAS=public (storage/graphql_public schemas dropped with their
  not-deployed services)

**Authentication**:
- SITE_URL: Frontend application URL
- JWT_EXPIRY=3600 (1 hour)
- ENABLE_EMAIL_SIGNUP / ENABLE_PHONE_SIGNUP
- SMTP configuration for email auth

**Edge Functions** (mapped in `deploy/k8s/base/supabase-app/functions.yaml`):
- `VERIFY_JWT: "false"` is a literal in the manifest; only `main/index.ts` reads
  it. `FUNCTIONS_VERIFY_JWT` from `.env.example` is not read by any code.
- SUPABASE_URL (literal `http://kong:8000`), SUPABASE_SERVICE_ROLE_KEY,
  NETMAKER_BASE_URL, NETMAKER_MASTER_KEY, PKI_BASE_URL / PKI_FLEET_TOKENS
  (optional) from `supabase-env`; IOTGW_BACKEND_URL is a literal;
  DEVICE_AUTH_TOKEN comes from the separate **`device-auth`** Secret (created by
  `bootstrap.sh` from the `iotgw-ui-backend` SOPS store, decision-033).
- KESTRA_BASE_URL / KESTRA_USER / KESTRA_PASSWORD are still mapped but **no
  function reads them** (their only consumer, kestra-call, was removed). The
  iotgw-ui backend reaches Kestra through its own `KESTRA_API_URL` (default
  `http://kestra.kestra.svc.cluster.local:8080`) + KESTRA_USER/KESTRA_PASSWORD.

### Kong Configuration

API gateway routes are defined in volumes/api/kong.yml. The k8s manifest renders
this file with secret substitution (`$SUPABASE_ANON_KEY`, `$SUPABASE_SERVICE_KEY`,
`$DASHBOARD_USERNAME`, `$DASHBOARD_PASSWORD`) via an `envsubst` initContainer
before Kong starts.

## Development Workflow

### Making Changes to Edge Functions

The function code is **baked into the `iotgw-functions:local` image**, so a code
change requires a rebuild + rollout (there is no bind-mounted restart-to-deploy):

1. Edit function code in volumes/functions/<function-name>/index.ts
2. Rebuild + load the image: `deploy/kind/bootstrap.sh functions` (docker build +
   `kind load`), then `kubectl -n supabase-app rollout restart deploy/functions`
   (`just k8s-deploy` does this as part of a full apply)
3. Test the function via HTTP requests to http://localhost:8000/functions/v1/<function-name>
4. Check logs: `kubectl -n supabase-app logs -f deploy/functions`

### Database Schema Changes

Migrations apply to the **cluster DB** (the StackGres SGCluster). The schema
source is `iotgw-ui/supabase/migrations/`.

1. Add a new hand-written, timestamped SQL file under `iotgw-ui/supabase/migrations/`
   (the only supported path; see [iotgw-ui/supabase/AGENTS.md](../iotgw-ui/supabase/AGENTS.md))
2. Apply them: `deploy/kind/bootstrap.sh migrate` (also run by `just k8s-deploy`;
   on OVH the same script with the OVH kubeconfig). It execs into the StackGres
   primary's `patroni` container as the superuser and runs the set — **only on a
   fresh DB** (it skips when `public.devices` exists; on an existing DB apply the
   new file by hand as in step 3)
3. For ad-hoc schema changes, either:
   - Connect to the primary and run SQL manually (see Database Operations above)
   - Or refresh the PostgREST schema cache:
     `kubectl -n supabase-app rollout restart deploy/rest`
     (the `migrate` step already does this after applying)

### Debugging

- All app-tier pods log to stdout/stderr, viewable with `kubectl -n supabase-app logs`
- Use `kubectl -n supabase-app logs -f deploy/<name>` to tail a specific Deployment's logs
- Check pod health: `kubectl -n supabase-app get pods` (and `kubectl -n supabase-app describe pod <pod>`)
- Exec into a pod: `kubectl -n supabase-app exec -it deploy/<name> -- sh`
- Edge function logs include request IDs and transaction IDs for tracing

### Testing

`package.json` has no test script. Edge-function unit tests are Deno tests:
`vpn/index_test.ts`, `_shared/device-auth_test.ts`, `_shared/sshsig_test.ts` (run
commands in [volumes/functions/AGENTS.md](volumes/functions/AGENTS.md)). The
platform end-to-end check is `just e2e`.

## Important Notes

1. **Security**: Real credentials and API keys live encrypted in
   `secrets/supabase.enc.env` (SOPS+age, decision-014) and reach the pods only as
   the `supabase-env` k8s Secret. Never commit a plaintext `.env` or hardcode a
   secret in tracked source.

2. **External Database**: The DB tier is the StackGres `SGCluster` `supabase-db`
   (`decision-018`); the app tier connects via the `POSTGRES_HOST=supabase-db`
   Service. Pointing the app tier at a different Postgres would mean changing the
   StackGres cluster / app-tier manifests under `deploy/k8s/` — there is no
   compose `db` service to comment out. Running fully external Postgres is out of
   scope for the kind deployment.

3. **JWT Keys**: ANON_KEY and SERVICE_ROLE_KEY must be generated using the JWT_SECRET. These are JWT tokens with specific role claims.

4. **Kestra Integration**: Live device/network provisioning runs through the netmaker-call function (direct Netmaker REST). The legacy kestra-call edge functions have been removed. Kestra is still used for the OpenWRT install/provisioning/connectivity flows, triggered directly from the iotgw-ui backend (KESTRA_USER / KESTRA_PASSWORD from secrets/, SOPS+age, decision-014). SSH-key generation is **not** a Kestra step: the backend mints keys in Cosmian KMS (`iotgw-ui/apps/backend/src/services/kms.ts`, decision-010).

5. **Package Manager**: This project uses pnpm (version 10.17.0) as specified in package.json packageManager field.

6. **Custom Host**: The deployment is configured for wsl.ymbihq.local as the public URL. Update SUPABASE_PUBLIC_URL in `secrets/supabase.enc.env` (then re-run `deploy/kind/bootstrap.sh secrets` + roll the consumers) for different environments.

## References

- [decision-003](../backlog/decisions/decision-003%20-%20Database-and-Infrastructure-Supabase-PostgreSQL-Choice.md) — why Supabase was chosen
- [decision-020](../backlog/decisions/decision-020%20-%20Namespace-per-subproject-topology-iotgw-is-the-cluster-not-a-namespace.md) — namespace-per-subproject split (`supabase-app` / `supabase-db`; `iotgw` is the cluster, not a namespace)
- [doc-010](../backlog/docs/doc-010%20-%20Database-Migration-and-Webhook-Management-Guide.md) — migration + webhook management (devices/networks triggers)
- [doc-016](../backlog/docs/doc-016%20-%20Database-Change-Provisioning-Automation-Pattern.md) — the DB-trigger → netmaker-call → Netmaker REST provisioning pattern
- [volumes/functions/AGENTS.md](volumes/functions/AGENTS.md) — edge function map
