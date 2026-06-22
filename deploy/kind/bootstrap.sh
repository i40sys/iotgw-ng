#!/usr/bin/env bash
# bootstrap.sh — create/destroy the local kind cluster and deploy the dev overlay.
#
#   deploy/kind/bootstrap.sh up      # create cluster + ingress-nginx
#   deploy/kind/bootstrap.sh kms-auth # provision KMS API-token key + store token in SOPS (task-057)
#   deploy/kind/bootstrap.sh secrets # create k8s Secrets from secrets/*.enc.env
#   deploy/kind/bootstrap.sh functions # build + kind-load the edge-functions image
#   deploy/kind/bootstrap.sh iotgw-ui # build + kind-load the iotgw-ui frontend+backend images
#   deploy/kind/bootstrap.sh deploy  # build functions+iotgw-ui, then apply the kind overlay
#   deploy/kind/bootstrap.sh smoke   # smoke-test deployed services
#   deploy/kind/bootstrap.sh down    # delete the cluster
#
# Prereqs: kind, kubectl, sops (+ age key), the workspace's compose stacks DOWN.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"

CLUSTER=iotgw
NS=iotgw

cluster_up() {
  if kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
    echo "kind cluster '$CLUSTER' already exists"
  else
    kind create cluster --config deploy/kind/cluster.yaml --wait 120s
  fi
  echo "==> installing ingress-nginx (kind provider, vendored v1.12.1)"
  kubectl apply -f deploy/k8s/ingress-nginx/deploy-ingress-nginx-v1.12.1.yaml
  echo "==> waiting for ingress-nginx controller"
  kubectl -n ingress-nginx wait --for=condition=ready pod \
    --selector=app.kubernetes.io/component=controller --timeout=180s || true
  kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
  install_stackgres
}

# StackGres operator — the Postgres tier is StackGres (decision-018). Version is
# PINNED: 1.18.x install is broken on k8s 1.31 (legacy SGConfig in its hook,
# rejected by strict decoding — TASK-062.16 finding); 1.17.4 installs clean.
SG_OPERATOR_VERSION="1.17.4"
install_stackgres() {
  echo "==> installing StackGres operator $SG_OPERATOR_VERSION (pinned)"
  helm repo add stackgres-charts https://stackgres.io/downloads/stackgres-k8s/stackgres/helm/ >/dev/null 2>&1 || true
  helm repo update stackgres-charts >/dev/null 2>&1 || true
  helm upgrade --install --create-namespace --namespace stackgres stackgres-operator \
    stackgres-charts/stackgres-operator --version "$SG_OPERATOR_VERSION" --wait --timeout 5m
}

make_secrets() {
  echo "==> creating k8s Secrets from SOPS store into namespace/$NS"
  kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
  # supabase: full env -> one Secret consumed by all supabase pods
  tools/secrets/secrets.sh k8s supabase "$NS" supabase-env | kubectl apply -f -
  tools/secrets/secrets.sh k8s kestra   "$NS" kestra-env   | kubectl apply -f -
  gen_initdb_secret
  gen_kms_auth_secret
  echo "secrets applied"
}

# Bridge the KMS API-token bearer (task-057) into the `kms-auth` Secret consumed
# by the iotgw-ui backend Deployment (KMS_AUTH_TOKEN env). The token VALUE lives
# in secrets/iotgw-ui-backend.enc.env (SOPS). Extract just that one key so the
# Secret holds nothing else. Idempotent (server-side apply of a fresh Secret).
gen_kms_auth_secret() {
  local tok
  tok="$(tools/secrets/secrets.sh cat iotgw-ui-backend 2>/dev/null \
        | grep -E '^KMS_AUTH_TOKEN=' | head -1 | cut -d= -f2-)" || true
  if [ -z "$tok" ]; then
    echo "  (skip kms-auth Secret: KMS_AUTH_TOKEN not found in SOPS store — run 'kms-auth' first)"
    return 0
  fi
  kubectl create secret generic kms-auth -n "$NS" \
    --from-literal=KMS_AUTH_TOKEN="$tok" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  echo "  kms-auth Secret applied (backend KMS_AUTH_TOKEN)"
}

# Provision the Cosmian KMS API-token symmetric key (task-057, AC#1) and persist
# the derived bearer token into the SOPS store. CHICKEN-AND-EGG: this must run
# while the KMS is still reachable WITHOUT auth (i.e. before api_token_id is
# enforced, or against a freshly-(re)started pod whose key already exists).
#
# Mechanism (Cosmian KMS 5.20, crate/server/src/middlewares/api_token):
#   - the server is configured with `[http] api_token_id = "<KEY_ID>"`;
#   - it fetches that symmetric key, base64-encodes its raw bytes, LOWERCASES it,
#     and requires `Authorization: Bearer <that-string>` on every request.
# So the bearer token = lowercased base64 of the key's raw bytes. We create the
# key with a deterministic id, export the raw bytes, derive the token, and store
# it in SOPS (secrets/iotgw-ui-backend.enc.env → KMS_AUTH_TOKEN). Idempotent:
# re-creating the same id is tolerated; the token is recomputed from the key.
KMS_TOKEN_KEY_ID="iotgw_api_token"
KMS_CLI="kms/contrib/cosmian"
kms_auth() {
  local kms_url="${KMS_URL:-http://localhost:9998}"
  echo "==> provisioning KMS API-token key '$KMS_TOKEN_KEY_ID' against $kms_url"
  [ -x "$KMS_CLI" ] || { echo "  cosmian CLI not found at $KMS_CLI"; return 1; }
  # Create the key (tolerate 'already exists').
  "$KMS_CLI" --kms-url "$kms_url" kms sym keys create "$KMS_TOKEN_KEY_ID" \
    -l 256 -a aes -t iotgw-api-token >/dev/null 2>&1 || \
    echo "  (create returned non-zero — key likely already exists, continuing)"
  # Export raw bytes and derive the bearer token (lowercased base64).
  local raw tok
  raw="$(mktemp)"
  if ! "$KMS_CLI" --kms-url "$kms_url" kms sym keys export -k "$KMS_TOKEN_KEY_ID" -f raw "$raw" >/dev/null 2>&1; then
    echo "  FAILED to export key (is the KMS reachable & still open?)"; rm -f "$raw"; return 1
  fi
  tok="$(base64 -w0 < "$raw" | tr 'A-Z' 'a-z')"
  rm -f "$raw"
  [ -n "$tok" ] || { echo "  FAILED to derive token"; return 1; }
  # Persist into the SOPS store (encrypted at rest).
  sops set secrets/iotgw-ui-backend.enc.env '["KMS_AUTH_TOKEN"]' "\"$tok\""
  echo "  KMS API-token key provisioned; KMS_AUTH_TOKEN stored in SOPS"
  echo "  NOTE: now set api_token_id in the KMS configmap and roll the KMS +"
  echo "        re-run 'secrets' to publish kms-auth + restart the backend."
}

# Generate the supabase-db-initdb Secret consumed by the StackGres SGScript's
# 90-secrets entry: supabase role passwords (== POSTGRES_PASSWORD) + the jwt
# GUCs, sourced from the SOPS store (decision-018 / task-056). Roles are CREATEd
# without passwords by 00-roles.sql; this sets their LOGIN passwords to match
# what the app tier connects with. NOTE: assumes the values contain no single
# quote (true for the generated supabase secrets).
gen_initdb_secret() {
  local env pw jwt exp
  env="$(tools/secrets/secrets.sh cat supabase 2>/dev/null)" || { echo "  (skip initdb secret: cannot read supabase env)"; return 0; }
  pw=$(printf '%s\n' "$env"  | grep -E '^POSTGRES_PASSWORD=' | head -1 | cut -d= -f2-)
  jwt=$(printf '%s\n' "$env" | grep -E '^JWT_SECRET='        | head -1 | cut -d= -f2-)
  # JWT_EXP is optional; grep exits 1 when absent — protect with || true
  exp=$(printf '%s\n' "$env" | grep -E '^JWT_EXP=' | head -1 | cut -d= -f2- || true)
  exp=${exp:-3600}
  local sql
  sql=$(cat <<SQL
ALTER ROLE authenticator             WITH PASSWORD '${pw}';
ALTER ROLE supabase_admin            WITH PASSWORD '${pw}';
ALTER ROLE supabase_auth_admin       WITH PASSWORD '${pw}';
ALTER ROLE supabase_storage_admin    WITH PASSWORD '${pw}';
ALTER ROLE supabase_functions_admin  WITH PASSWORD '${pw}';
ALTER ROLE pgbouncer                 WITH PASSWORD '${pw}';
ALTER DATABASE postgres SET "app.settings.jwt_secret" TO '${jwt}';
ALTER DATABASE postgres SET "app.settings.jwt_exp"    TO '${exp}';
SQL
)
  kubectl create secret generic supabase-db-initdb -n "$NS" \
    --from-literal=90-secrets.sql="$sql" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  echo "  supabase-db-initdb Secret applied (StackGres SGScript 90-secrets)"
}

build_functions() {
  # Bake the edge-function source into a local image (the kind overlay renames
  # supabase/edge-runtime:v1.74.0 -> iotgw-functions:local and drops the emptyDir
  # placeholder). Build context is supabase/volumes so the Dockerfile's
  # `COPY functions/ ...` picks up supabase/volumes/functions/.
  echo "==> building edge-functions image iotgw-functions:local"
  docker build -t iotgw-functions:local \
    -f deploy/k8s/base/supabase-app/Dockerfile.functions \
    supabase/volumes
  echo "==> loading iotgw-functions:local into kind cluster '$CLUSTER'"
  kind load docker-image iotgw-functions:local --name "$CLUSTER"
}

build_iotgw_ui() {
  # Build the iotgw-ui frontend and backend images and load them into kind.
  # Build context is iotgw-ui/ (the pnpm workspace root) for both images.
  # VITE_API_URL is baked into the frontend JS bundle at build time: the SPA
  # calls the backend via the ingress hostname iotgw-ui-backend.wsl.ymbihq.local
  # (port 80, ingress-nginx). On a future clean kind-up, NodePort 30444 also
  # maps to host :4444 (cluster.yaml).
  echo "==> building iotgw-ui-backend:local"
  docker build -t iotgw-ui-backend:local \
    -f iotgw-ui/apps/backend/.docker/Dockerfile \
    iotgw-ui/
  echo "==> building iotgw-ui-frontend:local (VITE_API_URL=http://iotgw-ui-backend.wsl.ymbihq.local)"
  docker build -t iotgw-ui-frontend:local \
    --build-arg VITE_API_URL=http://iotgw-ui-backend.wsl.ymbihq.local \
    -f iotgw-ui/apps/app/.docker/Dockerfile \
    iotgw-ui/
  echo "==> loading iotgw-ui-backend:local and iotgw-ui-frontend:local into kind cluster '$CLUSTER'"
  kind load docker-image iotgw-ui-backend:local  --name "$CLUSTER"
  kind load docker-image iotgw-ui-frontend:local --name "$CLUSTER"
}

# Resolve the StackGres primary pod name (role=master in 1.x, role=primary in
# some versions; falls back to the cluster's pod-0).
sg_primary_pod() {
  local p
  p="$(kubectl -n "$NS" get pod -l "stackgres.io/cluster-name=supabase-db,role=master" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)"
  [ -z "$p" ] && p="$(kubectl -n "$NS" get pod -l "stackgres.io/cluster-name=supabase-db,role=primary" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)"
  [ -z "$p" ] && p="supabase-db-0"
  printf '%s' "$p"
}

# Apply the iotgw-ui app schema to the StackGres primary. The SGScript initdb
# (00-roles.sql + 98-webhooks.sql + 90-secrets.sql) creates ONLY roles, pg_net,
# the supabase_functions schema, the jwt GUC and role passwords — the
# application tables (devices/networks/domains/*_jobs/deployments) come from the
# Supabase migrations. Run AS THE SUPERUSER (psql -U postgres) so SECURITY
# DEFINER functions, the issue_pg_net_access event trigger and role-owned
# objects round-trip with correct ownership (a non-superuser apply does NOT —
# see deploy/k8s/base/supabase-db-stackgres/CUTOVER.md). Idempotent: skipped
# when the schema already exists. This is the reproducible replacement for the
# manual one-off psql apply (task-062.04 caveat / task-062.07).
migrate_app_db() {
  local pod; pod="$(sg_primary_pod)"
  echo "==> applying iotgw-ui app schema to StackGres primary ($pod)"
  if [ "$(kubectl -n "$NS" exec -i "$pod" -c patroni -- psql -U postgres -d postgres --no-psqlrc -At -c "select to_regclass('public.devices') is not null;" 2>/dev/null)" = "t" ]; then
    echo "  app schema already present — skipping (use 'force-migrate' to re-apply into a fresh DB)"
    return 0
  fi
  local f
  for f in iotgw-ui/supabase/migrations/*.sql; do
    echo "  applying $(basename "$f")"
    if ! kubectl -n "$NS" exec -i "$pod" -c patroni -- psql -U postgres -d postgres --no-psqlrc -v ON_ERROR_STOP=1 -q -f - < "$f"; then
      echo "  FAILED on $(basename "$f")"; return 1
    fi
  done
  # PostgREST caches the schema — nudge it to reload after a fresh migration.
  kubectl -n "$NS" rollout restart deploy/rest >/dev/null 2>&1 || true
  echo "  app schema applied; PostgREST restarted to reload its schema cache"
}

deploy() {
  build_functions
  build_iotgw_ui
  echo "==> applying kustomize overlay deploy/k8s/overlays/kind"
  kubectl apply -k deploy/k8s/overlays/kind
  # Headlamp dashboard — its own dedicated namespace, applied standalone so the
  # iotgw overlay's namespace transformer doesn't absorb it (TASK-063, doc-017).
  echo "==> applying Headlamp dashboard (namespace: headlamp)"
  kubectl apply -k deploy/k8s/headlamp
  echo "==> waiting for core workloads (best-effort)"
  kubectl -n "$NS" rollout status deploy/cosmian-kms --timeout=120s || true
  # StackGres manages the DB StatefulSet — wait on the primary pod label
  # (role=master is StackGres 1.x primary label; role=primary in some versions).
  echo "  waiting for StackGres supabase-db primary pod Ready..."
  kubectl -n "$NS" wait pod \
    -l "stackgres.io/cluster-name=supabase-db,role=master" \
    --for=condition=Ready --timeout=300s 2>/dev/null || \
  kubectl -n "$NS" wait pod \
    -l "stackgres.io/cluster-name=supabase-db,role=primary" \
    --for=condition=Ready --timeout=60s 2>/dev/null || \
  kubectl -n "$NS" wait pod \
    -l "stackgres.io/cluster=true,stackgres.io/cluster-name=supabase-db" \
    --for=condition=Ready --timeout=60s 2>/dev/null || true
  migrate_app_db
}

smoke() {
  echo "==> cluster nodes"; kubectl get nodes
  echo "==> pods in $NS"; kubectl -n "$NS" get pods -o wide
  echo "==> services in $NS"; kubectl -n "$NS" get svc
  echo "==> KMS health (/version)"
  # The task-057 NetworkPolicy is enforced by kindnet on this cluster, so the
  # host NodePort path is blocked (host/SNAT traffic is not an in-namespace pod).
  # Try host NodePort first, then fall back to an in-cluster check from the
  # NP-allowed backend pod — the path the NetworkPolicy actually governs.
  if curl -fsS -m 6 http://localhost:9998/version; then
    echo "  KMS OK (host NodePort)"
  elif kubectl -n "$NS" exec deploy/iotgw-ui-backend -- node -e 'fetch("http://cosmian-kms:9998/version").then(async r=>{console.log(await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))'; then
    echo "  KMS OK (in-cluster; NodePort blocked by NetworkPolicy as expected)"
  else
    echo "  KMS not reachable"
  fi
}

case "${1:-}" in
  up) cluster_up ;;
  kms-auth) kms_auth ;;
  secrets) make_secrets ;;
  functions) build_functions ;;
  iotgw-ui) build_iotgw_ui ;;
  deploy) make_secrets; deploy ;;
  migrate) migrate_app_db ;;
  force-migrate)
    # Re-apply the app schema into a FRESH DB even if the guard table is missing
    # — used by the cutover runbook after a clean SGCluster init.
    pod="$(sg_primary_pod)"
    for f in iotgw-ui/supabase/migrations/*.sql; do
      echo "  applying $(basename "$f")"
      kubectl -n "$NS" exec -i "$pod" -c patroni -- psql -U postgres -d postgres --no-psqlrc -v ON_ERROR_STOP=1 -q -f - < "$f" || { echo "  FAILED on $(basename "$f")"; exit 1; }
    done
    kubectl -n "$NS" rollout restart deploy/rest >/dev/null 2>&1 || true ;;
  smoke) smoke ;;
  down) kind delete cluster --name "$CLUSTER" ;;
  *) sed -n '2,13p' "${BASH_SOURCE[0]}"; exit 1 ;;
esac
