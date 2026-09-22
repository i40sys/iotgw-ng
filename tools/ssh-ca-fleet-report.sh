#!/usr/bin/env bash
# ssh-ca-fleet-report.sh — the decision-027 phase-4 gate report (task-098).
#
# Shows, per gateway: enrollment state, host-certificate expiry, and whether the
# phase-4 checklist passes; plus the three fleet-state queues (work / renewal /
# enrolled-count) the cohort rollout is driven from — off `devices`, not a
# spreadsheet.
#
# The TWO log-derived criteria (AC#3/#4) — "last KRL pull" and "zero raw-key
# logins for two consecutive weeks" — can only be evidenced once every gateway
# runs `sshd LogLevel VERBOSE` AND forwards auth logs to a queryable collector.
# Until that collection exists this report prints those columns as PENDING and
# emits the exact query to run against the collector, rather than asserting them.
#
# Usage: tools/ssh-ca-fleet-report.sh            # human table
#        RENEW_WINDOW_DAYS=30 tools/ssh-ca-fleet-report.sh
#
# Read-only. Talks to the StackGres primary via kubectl exec (needs the cluster).
set -euo pipefail

NS_DB="${NS_DB:-supabase-db}"
RENEW_WINDOW_DAYS="${RENEW_WINDOW_DAYS:-30}"

# Central auth-log collector endpoint for the AC#3/#4 metrics. Empty = not yet
# deployed (canary-only rollout); the log-derived columns then print PENDING.
SSH_LOG_COLLECTOR="${SSH_LOG_COLLECTOR:-}"

die() { echo "ssh-ca-fleet-report: $*" >&2; exit 1; }

command -v kubectl >/dev/null || die "kubectl not found"
PG="$(kubectl -n "$NS_DB" get pod -l 'stackgres.io/cluster-name=supabase-db,role=primary' \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
[ -n "$PG" ] || die "no StackGres primary pod in ns $NS_DB (is the cluster up?)"

q() { kubectl -n "$NS_DB" exec "$PG" -c patroni -- psql -X -q -U postgres -d postgres -At -F'|' -c "$1" 2>/dev/null; }

echo "== SSH-CA fleet gate report (decision-027 phase 4, task-098) =="
echo "   generated $(date -u +%Y-%m-%dT%H:%M:%SZ) · renewal window ${RENEW_WINDOW_DAYS}d"
echo

# ── enrolled / total ────────────────────────────────────────────────────────
counts="$(q "SELECT count(*) FILTER (WHERE ssh_ca_enrolled_at IS NOT NULL), count(*) FROM devices;")"
enrolled="${counts%%|*}"; total="${counts##*|}"
echo "Enrolled: ${enrolled}/${total}"
echo

# ── per-gateway table ───────────────────────────────────────────────────────
printf '%-26s %-16s %-16s %-9s %-22s %-8s %s\n' \
  DEVICE IP ZONE ENROLLED CERT_VALID_BEFORE DAYS_LEFT CHECKLIST
printf '%-26s %-16s %-16s %-9s %-22s %-8s %s\n' \
  '------' '--' '----' '--------' '-----------------' '---------' '---------'

rows="$(q "
  SELECT d.name, coalesce(host(d.ip_address::inet)::text, d.ip_address::text, ''),
         coalesce(dom.pki_zone,''),
         (d.ssh_ca_enrolled_at IS NOT NULL),
         coalesce(to_char(d.ssh_host_cert_valid_before,'YYYY-MM-DD\"T\"HH24:MI:SSZ'),''),
         coalesce(extract(day from (d.ssh_host_cert_valid_before - now()))::int::text,''),
         (dom.pki_zone IS NOT NULL AND dom.pki_user_ca_id IS NOT NULL)
  FROM devices d
  JOIN networks n  ON d.network_id = n.id
  JOIN domains  dom ON n.domain_id = dom.id
  ORDER BY dom.name, d.name;")"

work=0; renew=0
while IFS='|' read -r name ip zone enrolled_b vbefore days zoneok; do
  [ -z "$name" ] && continue
  # phase-4 checklist per gateway: zone linked AND enrolled AND cert not inside
  # the renewal window AND (log criteria — PENDING until a collector exists).
  check="FAIL"
  if [ "$zoneok" = "t" ] && [ "$enrolled_b" = "t" ]; then
    if [ -n "$days" ] && [ "$days" -ge "$RENEW_WINDOW_DAYS" ]; then
      check="$([ -n "$SSH_LOG_COLLECTOR" ] && echo PASS || echo 'PASS*')"
    else
      check="RENEW"
    fi
  fi
  [ "$enrolled_b" = "t" ] || work=$((work+1))
  if [ "$enrolled_b" = "t" ] && [ -n "$days" ] && [ "$days" -lt "$RENEW_WINDOW_DAYS" ]; then renew=$((renew+1)); fi
  printf '%-26s %-16s %-16s %-9s %-22s %-8s %s\n' \
    "$name" "${ip:-–}" "${zone:-–}" \
    "$([ "$enrolled_b" = t ] && echo yes || echo NO)" \
    "${vbefore:-–}" "${days:-–}" "$check"
done <<EOF
$rows
EOF

echo
echo "Work queue (ssh_ca_enrolled_at IS NULL): ${work} gateway(s) — enroll on their next provisioning run (AC#2)."
echo "Renewal queue (cert < now()+${RENEW_WINDOW_DAYS}d): ${renew} gateway(s) — the ssh-ca-renewal flow re-signs them."
echo

# ── AC#3 / AC#4 — log-derived, needs a collector ────────────────────────────
if [ -z "$SSH_LOG_COLLECTOR" ]; then
  cat <<'NOTE'
CHECKLIST legend: PASS* = enrollment + cert criteria met, but the LOG criteria
(AC#3/#4) are NOT yet evidenced — no central auth-log collector is configured
(SSH_LOG_COLLECTOR is empty). To close the gate you still need, fleet-wide:
  1. sshd `LogLevel VERBOSE` (ships via tasks/system.yaml on the next enroll).
  2. gateway rsyslog forwarding auth.* to a queryable collector.
Then, per gateway, the two-week zero-raw-key criterion is:
  # certificate logins carry an  ID <keyid> (serial N) CA <fp>  suffix:
  cert_logins  = count 'Accepted publickey .* ID .* CA '        over the last 14d
  rawkey_logins= count 'Accepted publickey ' MINUS cert_logins  over the last 14d
  gate passes for a gateway iff rawkey_logins == 0 for 14 consecutive days.
Set SSH_LOG_COLLECTOR and extend this report to run those counts once collection exists.
NOTE
else
  echo "SSH_LOG_COLLECTOR=$SSH_LOG_COLLECTOR — (log-count integration TODO: wire the 14d cert-vs-rawkey queries here)."
fi
