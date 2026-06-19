#!/usr/bin/env bash
# verify.sh — repeatable verification of the monorepo / secrets / k8s work.
# Runs the checks that don't require a running cluster, plus the kind smoke
# tests if the cluster is up. Exit non-zero on any failure.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
rc=0
pass(){ echo "  PASS  $1"; }
fail(){ echo "  FAIL  $1"; rc=1; }

echo "== 1. No real secrets in tracked source =="
LEAK=0
for pat in '***REMOVED-DECOMMISSIONED***' 'The2password' '***REMOVED-GEMINI-KEY***' '***REMOVED-FRAGMENT***' '***REMOVED-FRAGMENT***'; do
  # Exclude the SOPS store, encrypted files, and the two scanners that
  # legitimately list these patterns to grep FOR them (this file +
  # tools/secrets/secrets.sh) — matching them would be a self-test false positive.
  if git grep -qI "$pat" -- ':!secrets/' ':!*.enc.*' ':!tools/verify.sh' ':!tools/secrets/secrets.sh' 2>/dev/null; then
    fail "secret '$pat' still in tracked source"; LEAK=1
  fi
done
[ "$LEAK" = 0 ] && pass "no known secrets in tracked source"

echo "== 2. SOPS store round-trips with no cleartext leak =="
if tools/secrets/secrets.sh check >/tmp/verify-secrets.log 2>&1; then pass "secrets.sh check"; else fail "secrets.sh check (see /tmp/verify-secrets.log)"; fi

echo "== 3. .env.example templates carry no real values =="
if git ls-files '*.env.example' | xargs -r grep -lE 'NBMtSWau|The2password|AIzaSy|sk-proj' 2>/dev/null | grep -q .; then
  fail "a .env.example contains a real secret"; else pass ".env.example templates clean"; fi

echo "== 4. Kustomize overlays render =="
for ov in kind prod; do
  if kubectl kustomize "deploy/k8s/overlays/$ov" >/tmp/verify-$ov.yaml 2>/tmp/verify-$ov.err; then
    pass "overlay $ov renders ($(grep -c '^kind:' /tmp/verify-$ov.yaml) objects)"
  else fail "overlay $ov render (see /tmp/verify-$ov.err)"; fi
done

echo "== 5. iotgw-ui typecheck + tests =="
if (cd iotgw-ui && pnpm -s typecheck >/tmp/verify-tsc.log 2>&1); then pass "typecheck"; else fail "typecheck (see /tmp/verify-tsc.log)"; fi
if (cd iotgw-ui && pnpm -s test >/tmp/verify-test.log 2>&1); then pass "vitest"; else fail "vitest (see /tmp/verify-test.log)"; fi

echo "== 6. kind smoke (only if cluster up) =="
if kind get clusters 2>/dev/null | grep -qx iotgw; then
  # KMS smoke. With the task-057 NetworkPolicy enforced (kindnet on this cluster
  # DOES enforce — see deploy/k8s/base/kms/networkpolicy.yaml), the host NodePort
  # path is blocked because host/SNAT traffic isn't an in-namespace pod. So try
  # the host NodePort first, then fall back to an in-cluster check from an
  # NP-allowed client (the backend pod) — that is the path the NP governs.
  if curl -fsS -m 6 http://localhost:9998/version >/dev/null 2>&1; then
    pass "KMS :9998/version (host NodePort)"
  elif kubectl -n iotgw exec deploy/iotgw-ui-backend -- node -e 'fetch("http://cosmian-kms:9998/version").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then
    pass "KMS /version (in-cluster, NodePort blocked by NetworkPolicy as expected)"
  else
    fail "KMS :9998/version (neither host NodePort nor in-cluster)"
  fi
  # Kestra '/' 307-redirects to '/ui/'; check the UI returns 200.
  curl -fsS -o /dev/null -w '%{http_code}' http://localhost:8080/ui/ 2>/dev/null | grep -q 200 && pass "Kestra :8080/ui/" || fail "Kestra :8080"
  curl -fsS -H 'Host: whoami.wsl.ymbihq.local' http://localhost/ >/dev/null 2>&1 && pass "whoami via ingress" || fail "whoami ingress"
  # Supabase API path via Kong (:8000). 401 means "needs apikey" — that still
  # proves Kong routes to a live service; 000/refused means it is down.
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 8 http://localhost:8000/auth/v1/health 2>/dev/null)
  case "$code" in 200|401) pass "GoTrue via Kong :8000/auth/v1 (HTTP $code)";; *) fail "GoTrue via Kong :8000/auth/v1 (HTTP $code)";; esac
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 8 http://localhost:8000/rest/v1/ 2>/dev/null)
  case "$code" in 200|401) pass "PostgREST via Kong :8000/rest/v1 (HTTP $code)";; *) fail "PostgREST via Kong :8000/rest/v1 (HTTP $code)";; esac
  curl -fsS -m 8 http://localhost:8000/functions/v1/hello >/dev/null 2>&1 && pass "edge functions via Kong /functions/v1/hello" || fail "edge functions /functions/v1/hello"
  # netmaker-call: invalid table -> 400 immediately (proves routing+dispatch with
  # NO provisioning side effect).
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 8 -X POST http://localhost:8000/functions/v1/netmaker-call -H 'Content-Type: application/json' -d '{"table":"__smoke__"}' 2>/dev/null)
  [ "$code" = 400 ] && pass "netmaker-call dispatch (invalid table -> 400)" || fail "netmaker-call dispatch (HTTP $code, expected 400)"
  # Deep assertion (task-055): a device + a network INSERT each drive
  # net.http_post -> net._http_response (HTTP 202) + a *_jobs row. Side-effect-
  # free (test rows fail provisioning before any Netmaker object is created, then
  # are cleaned up). Set SKIP_PGNET_SMOKE=1 to skip the mutating check.
  if [ "${SKIP_PGNET_SMOKE:-0}" = 1 ]; then
    echo "  SKIP  pg_net fire assertion (SKIP_PGNET_SMOKE=1)"
  elif bash tools/smoke-pgnet.sh; then
    pass "pg_net webhooks fire (device + network INSERT)"
  else
    fail "pg_net webhooks fire (see assertion output above)"
  fi
  # iotgw-ui (task-062.08): reach it via the ingress hostnames, which work on
  # the live cluster AND after a clean kind-up (host ports 5173/4444 only map on
  # a fresh cluster via cluster.yaml). Gate on the Deployment so a host pnpm-dev
  # server cannot give a false PASS.
  if kubectl -n iotgw get deploy iotgw-ui-frontend >/dev/null 2>&1; then
    curl -fsS -m 8 -H 'Host: iotgw-ui.wsl.ymbihq.local' http://localhost/ >/dev/null 2>&1 \
      && pass "iotgw-ui frontend via ingress" || fail "iotgw-ui frontend via ingress"
    # tRPC backend has no health route; any HTTP response (e.g. 404 NOT_FOUND on /)
    # through the ingress proves it is up.
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 8 -H 'Host: iotgw-ui-backend.wsl.ymbihq.local' http://localhost/ 2>/dev/null)
    case "$code" in 200|404|405) pass "iotgw-ui backend via ingress (HTTP $code)";; *) fail "iotgw-ui backend via ingress (HTTP $code)";; esac
  else
    echo "  SKIP  iotgw-ui not in-cluster yet (task-062.08)"
  fi
else
  echo "  SKIP  kind cluster not running (just kind-up && just k8s-deploy)"
fi

echo ""
[ "$rc" = 0 ] && echo "ALL VERIFICATIONS PASSED" || echo "SOME VERIFICATIONS FAILED"
exit $rc
