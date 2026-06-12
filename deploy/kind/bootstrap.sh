#!/usr/bin/env bash
# bootstrap.sh — create/destroy the local kind cluster and deploy the dev overlay.
#
#   deploy/kind/bootstrap.sh up      # create cluster + ingress-nginx
#   deploy/kind/bootstrap.sh secrets # create k8s Secrets from secrets/*.enc.env
#   deploy/kind/bootstrap.sh deploy  # apply the kind kustomize overlay
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
  echo "==> installing ingress-nginx (kind provider)"
  kubectl apply -f https://kind.sigs.k8s.io/examples/ingress/deploy-ingress-nginx.yaml
  echo "==> waiting for ingress-nginx controller"
  kubectl -n ingress-nginx wait --for=condition=ready pod \
    --selector=app.kubernetes.io/component=controller --timeout=180s || true
  kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
}

make_secrets() {
  echo "==> creating k8s Secrets from SOPS store into namespace/$NS"
  kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
  # supabase: full env -> one Secret consumed by all supabase pods
  tools/secrets/secrets.sh k8s supabase "$NS" supabase-env | kubectl apply -f -
  tools/secrets/secrets.sh k8s kestra   "$NS" kestra-env   | kubectl apply -f -
  echo "secrets applied"
}

deploy() {
  echo "==> applying kustomize overlay deploy/k8s/overlays/kind"
  kubectl apply -k deploy/k8s/overlays/kind
  echo "==> waiting for core workloads (best-effort)"
  kubectl -n "$NS" rollout status deploy/cosmian-kms --timeout=120s || true
  kubectl -n "$NS" rollout status statefulset/supabase-db --timeout=180s || true
}

smoke() {
  echo "==> cluster nodes"; kubectl get nodes
  echo "==> pods in $NS"; kubectl -n "$NS" get pods -o wide
  echo "==> services in $NS"; kubectl -n "$NS" get svc
  echo "==> KMS health (NodePort 9998)"
  curl -fsS http://localhost:9998/version && echo "  KMS OK" || echo "  KMS not reachable"
}

case "${1:-}" in
  up) cluster_up ;;
  secrets) make_secrets ;;
  deploy) make_secrets; deploy ;;
  smoke) smoke ;;
  down) kind delete cluster --name "$CLUSTER" ;;
  *) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 1 ;;
esac
