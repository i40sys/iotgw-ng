#!/usr/bin/env bash
# tools/smoke-pgnet.sh — assert the pg_net webhook bgworker actually FIRES.
#
# Task-055: re-pointing the trigger URL (now http://kong:8000/functions/v1/
# netmaker-call) only proves the *string* changed. This proves the live path:
# a device INSERT and a network INSERT each (a) queue + deliver a net.http_post
# that records a row in net._http_response (HTTP 202), AND (b) drive the
# netmaker-call edge function to create a *_jobs row. net._http_response has a
# TTL, so its rows can be empty between runs — the assertion does a FRESH insert
# and waits for the row to appear, closing the silent-failure hole (a failed
# net.http_post otherwise leaves the trigger returning NEW with no error).
#
# Side-effect-free against production Netmaker: the test rows are crafted so the
# background provisioning FAILS before any real Netmaker object is created
# (network → NULL ipv4_cidr makes provisionNetwork throw; device → attached to
# that un-provisioned network so provisionDevice finds no Netmaker network).
# Both the device and the network rows + their *_jobs rows are cleaned up.
#
# Usage:  tools/smoke-pgnet.sh           (requires the kind cluster up)
#         NS=supabase-db SMOKE_PGNET_TIMEOUT=30 tools/smoke-pgnet.sh
# Exit 0 = both webhooks fired; non-zero = a silent pg_net failure was caught.
#
# NS defaults to the supabase-db namespace (decision-020): the StackGres primary
# and pg_net live there; the webhook fires cross-namespace to
# kong.supabase-app.svc.cluster.local:8000.
set -uo pipefail

NS="${NS:-supabase-db}"
TIMEOUT="${SMOKE_PGNET_TIMEOUT:-30}"

# StackGres primary pod label (since 062.04 cutover); fall back to the legacy
# app.kubernetes.io/name=supabase-db label (StatefulSet era) then to the
# hardcoded pod name so this script works in both configurations.
DBPOD="$(kubectl -n "$NS" get pod \
  -l "stackgres.io/cluster-name=supabase-db,role=primary" \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)"
[ -z "$DBPOD" ] && DBPOD="$(kubectl -n "$NS" get pod \
  -l app.kubernetes.io/name=supabase-db \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)"
[ -z "$DBPOD" ] && DBPOD="supabase-db-0"

# q SQL  → run SQL, tuples-only/unaligned.
# --no-psqlrc suppresses the "Pager usage is off." banner that StackGres's
# patroni container psqlrc prints to stdout, which would corrupt captured values.
q() { kubectl -n "$NS" exec -i "$DBPOD" -- psql -U postgres -d postgres --no-psqlrc -At -c "$1" 2>/dev/null; }

uuid() { cat /proc/sys/kernel/random/uuid; }

DOMAIN_ID="$(q "select id from public.domains order by created_at nulls last limit 1;")"
if [ -z "$DOMAIN_ID" ]; then
  echo "  FAIL  smoke-pgnet: no domain row to anchor the test network"; exit 1
fi

NET_ID="$(uuid)"
DEV_ID="$(uuid)"
SUFFIX="$$_${RANDOM}"
rc=0

cleanup() {
  # delete device first (explicit), then network; both fire delete webhooks
  # against non-existent Netmaker objects (harmless 404 → no-op). The delete
  # webhooks create their own *_jobs rows asynchronously, so settle briefly
  # then purge every job row for THIS run by its id (covers insert + delete).
  q "delete from public.devices where id='${DEV_ID}';" >/dev/null
  q "delete from public.networks where id='${NET_ID}';" >/dev/null
  sleep 3
  q "delete from public.device_jobs  where device_id='${DEV_ID}';" >/dev/null
  q "delete from public.network_jobs where network_id='${NET_ID}';" >/dev/null
}
trap cleanup EXIT

# assert_fire ENTITY HOOK INSERT_SQL FK_COL ID JOBS_TABLE
assert_fire() {
  local entity="$1" hook="$2" insert_sql="$3" fk_col="$4" id="$5" jobs="$6"
  local h0 rid resp job waited=0
  h0="$(q "select coalesce(max(id),0) from supabase_functions.hooks;")"
  if ! q "$insert_sql" >/dev/null; then
    echo "  FAIL  pg_net ${entity}: INSERT rejected"; return 1
  fi
  while [ "$waited" -lt "$TIMEOUT" ]; do
    rid="$(q "select request_id from supabase_functions.hooks where id>${h0} and hook_name='${hook}' order by id desc limit 1;")"
    job="$(q "select count(*) from public.${jobs} where ${fk_col}='${id}';")"
    if [ -n "$rid" ]; then
      resp="$(q "select status_code from net._http_response where id=${rid};")"
    else
      resp=""
    fi
    if [ "${job:-0}" -ge 1 ] && [ "${resp:-}" = "202" ]; then
      echo "  PASS  pg_net ${entity}: net._http_response id=${rid} → HTTP 202 + ${jobs} row"
      return 0
    fi
    sleep 2; waited=$((waited+2))
  done
  echo "  FAIL  pg_net ${entity}: no fire within ${TIMEOUT}s (hook_rid='${rid:-}', resp='${resp:-}', ${jobs}_rows='${job:-0}')"
  return 1
}

echo "== pg_net webhook fire assertion (task-055) =="

# --- network INSERT (ipv4_cidr NULL → provisionNetwork throws, no Netmaker net)
assert_fire "network INSERT" "networks_webhook" \
  "insert into public.networks (id,domain_id,name,ipv4_cidr,ipv6_cidr) values ('${NET_ID}','${DOMAIN_ID}','__smoke_net_${SUFFIX}',null,null);" \
  "network_id" "${NET_ID}" "network_jobs" || rc=1

# --- device INSERT (attached to the un-provisioned smoke network)
assert_fire "device INSERT" "devices_webhook" \
  "insert into public.devices (id,network_id,name,totp_counter) values ('${DEV_ID}','${NET_ID}','__smoke_dev_${SUFFIX}',0);" \
  "device_id" "${DEV_ID}" "device_jobs" || rc=1

[ "$rc" = 0 ] && echo "  pg_net assertion: BOTH webhooks fired" || echo "  pg_net assertion: a webhook did NOT fire (silent pg_net failure)"
exit $rc
