#!/usr/bin/env bash
# Operator-side SSH-CA fleet re-issue report — the rotation RETIREMENT GATE
# (decision-028 §4, task-103 AC#4).
#
# Before you RETIRE a rotating CA, you must prove every device has re-issued
# under the new (active) successor — retiring a CA invalidates everything it
# signed. This queries pki-manager for each rotating CA and reports whether any
# LIVE certificate is still signed by it. A CA is safe to retire iff that count
# is zero.
#
# iotgw-ng runs no PKI of its own: the report is computed by pki-manager
# (GET /api/v1/ssh/cas/:caId/reissue-report) and this script only calls it.
#
# Usage:
#   PKI_TOKEN=<jwt> scripts/ssh-ca/fleet-report.sh                 # every rotating CA, all zones
#   PKI_TOKEN=<jwt> scripts/ssh-ca/fleet-report.sh warehouse       # only that domain's zone
#   PKI_TOKEN_CMD='my-oidc-login --print-token' scripts/ssh-ca/fleet-report.sh
#
# Env:
#   PKI_BASE_URL      default https://pki.joor.net
#   PKI_TOKEN         OIDC bearer JWT     (required unless PKI_TOKEN_CMD is set)
#   PKI_TOKEN_CMD     command printing a bearer JWT to stdout
#   DOMAIN_ZONE_MAP   "<domain>=<zone>[,...]" to resolve the arg without cluster access
#
# Exit status: 0 = nothing pending / all rotating CAs safe to retire;
#              2 = at least one rotating CA still has un-re-issued devices.

set -euo pipefail

PKI_BASE_URL="${PKI_BASE_URL:-https://pki.joor.net}"
API="${PKI_BASE_URL%/}/api/v1"
WANT_DOMAIN="${1:-}"

die() { echo "ssh-ca/fleet-report: $*" >&2; exit 1; }

command -v curl >/dev/null || die "curl not found"
command -v python3 >/dev/null || die "python3 not found (used to parse pki-manager JSON)"

TOKEN="${PKI_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -n "${PKI_TOKEN_CMD:-}" ]; then
  TOKEN="$(eval "$PKI_TOKEN_CMD")" || die "PKI_TOKEN_CMD failed"
fi
[ -n "$TOKEN" ] || die "no OIDC token — set PKI_TOKEN (a bearer JWT) or PKI_TOKEN_CMD"

# Optional: resolve <domain> -> <zone slug> to scope the report to one zone.
ZONE_FILTER=""
if [ -n "$WANT_DOMAIN" ]; then
  if [ -n "${DOMAIN_ZONE_MAP:-}" ]; then
    ZONE_FILTER="$(echo "$DOMAIN_ZONE_MAP" | tr ',' '\n' | awk -F= -v d="$WANT_DOMAIN" '$1==d{print $2}')"
  elif command -v kubectl >/dev/null; then
    ZONE_FILTER="$(kubectl -n supabase-db exec supabase-db-0 -c patroni -- \
      psql -U postgres -d postgres -At -c \
      "SELECT pki_zone FROM domains WHERE name='$WANT_DOMAIN' AND pki_zone IS NOT NULL;" \
      2>/dev/null | tr -d '[:space:]')"
  fi
  [ -n "$ZONE_FILTER" ] || die "could not resolve domain '$WANT_DOMAIN' to a zone (set DOMAIN_ZONE_MAP or ensure kubectl access)"
fi

API="$API" TOKEN="$TOKEN" ZONE_FILTER="$ZONE_FILTER" python3 - <<'PY'
import os, sys, json, urllib.request, urllib.error

API = os.environ["API"]
TOKEN = os.environ["TOKEN"]
ZF = os.environ.get("ZONE_FILTER", "")

def get(path):
    req = urllib.request.Request(API + path,
                                 headers={"Authorization": "Bearer " + TOKEN,
                                          "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit("ssh-ca/fleet-report: GET %s failed (HTTP %s): %s"
                 % (path, e.code, e.read()[:200].decode("utf-8", "replace")))

def rows(x):
    return x if isinstance(x, list) else x.get("items", x)

zones = rows(get("/ssh/zones?includeArchived=true"))
id2slug = {z["id"]: z.get("name") for z in zones}
slug2id = {z.get("name"): z["id"] for z in zones}
target = slug2id.get(ZF) if ZF else None
if ZF and not target:
    sys.exit("ssh-ca/fleet-report: zone '%s' not found" % ZF)

cas = rows(get("/ssh/cas"))
def zid(c):
    return c.get("zoneId") or c.get("zone")
rotating = [c for c in cas
            if c.get("status") == "rotating"
            and (target is None or zid(c) == target)]

if not rotating:
    where = " in zone " + ZF if ZF else ""
    print("No rotating CAs%s — nothing is pending retirement." % where)
    sys.exit(0)

all_safe = True
for c in rotating:
    rep = get("/ssh/cas/%s/reissue-report" % c["id"])
    safe = bool(rep["safeToRetire"])
    all_safe = all_safe and safe
    slug = id2slug.get(zid(c), zid(c))
    print("=" * 72)
    print("zone %s | %s CA %s (%s)" % (slug, c.get("caType"), c["id"], c.get("label")))
    print("  live certs still under this CA : %d" % rep["liveCertsUnderThisCa"])
    print("  re-issued under successor      : %d  (successor %s)"
          % (rep["reissuedUnderSuccessor"], rep.get("successorCaId")))
    print("  SAFE TO RETIRE                 : %s" % ("YES" if safe else "NO"))
    for p in rep.get("pending", []):
        print("    - not re-issued: %s  serial=%s  keyId=%s  expires=%s"
              % (p.get("subject") or "(user/unknown subject)",
                 p["serial"], p["keyId"], p["validBefore"]))

print("=" * 72)
if all_safe:
    print("VERDICT: all rotating CAs are safe to retire.")
    sys.exit(0)
print("VERDICT: NOT SAFE — some devices have not re-issued under the successor "
      "(see above). Re-enroll them before retiring the old CA.")
sys.exit(2)
PY
