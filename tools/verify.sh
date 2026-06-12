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
# kms/ssh-test/docker-test/README.md contains only ILLUSTRATIVE truncated key
# diagrams (ASCII art, "...(Base64 encoded)"), not real material — excluded.
LEAK=0
for pat in '***REMOVED-DECOMMISSIONED***' 'The2password' '***REMOVED-GEMINI-KEY***' '***REMOVED-FRAGMENT***' '***REMOVED-FRAGMENT***'; do
  if git grep -qI "$pat" -- ':!secrets/' ':!*.enc.*' ':!tools/verify.sh' 2>/dev/null; then
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
  curl -fsS http://localhost:9998/version >/dev/null 2>&1 && pass "KMS :9998/version" || fail "KMS :9998"
  # Kestra '/' 307-redirects to '/ui/'; check the UI returns 200.
  curl -fsS -o /dev/null -w '%{http_code}' http://localhost:8080/ui/ 2>/dev/null | grep -q 200 && pass "Kestra :8080/ui/" || fail "Kestra :8080"
  curl -fsS -H 'Host: whoami.wsl.ymbihq.local' http://localhost/ >/dev/null 2>&1 && pass "whoami via ingress" || fail "whoami ingress"
else
  echo "  SKIP  kind cluster not running (just kind-up && just k8s-deploy)"
fi

echo ""
[ "$rc" = 0 ] && echo "ALL VERIFICATIONS PASSED" || echo "SOME VERIFICATIONS FAILED"
exit $rc
