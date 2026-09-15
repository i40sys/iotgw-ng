#!/usr/bin/env bash
# Operator-side SSH user-certificate issuance (decision-024 §user, decision-027
# phase 3, decision-028 §1).
#
# Requests a short-lived `iotgw-admin` user certificate from pki-manager and
# drops it next to your SSH key as `<IdentityFile>-cert.pub`, which OpenSSH then
# picks up automatically — so you authenticate to any gateway in the zone with a
# certificate, not a per-host authorized_keys entry, and you never copy a private
# key anywhere.
#
# Renewal is the SAME command: an expired certificate is replaced by re-running
# this, with NO new key (AC#5). The private key never leaves your machine.
#
# Contract (pki-manager OpenAPI, https://pki.joor.net/api/v1/openapi.json):
#   GET  /api/v1/ssh/identities                 -> resolve your identityId by subject
#   POST /api/v1/ssh/users/issue  (Bearer JWT)  -> {identityId, sshPublicKey, principals[, validForSeconds]}
# The response carries the signed cert as `certOpenssh` (same shape the verified
# sign-host path returns in supabase/.../_shared/pki-manager.ts).
#
# Auth: your OWN OIDC JWT (the iotgw-ng fleet token deliberately CANNOT sign user
# certs — decision-028 §9). Obtain a token by logging in to pki.joor.net and
# supply it via PKI_TOKEN, or set PKI_TOKEN_CMD to a command that prints one.
#
# Usage:
#   PKI_TOKEN=<jwt> PKI_SUBJECT=oriol@ymbi.eu scripts/ssh-ca/user-cert.sh warehouse
#   PKI_TOKEN_CMD='my-oidc-login --print-token' scripts/ssh-ca/user-cert.sh warehouse
# Env:
#   PKI_BASE_URL   default https://pki.joor.net
#   PKI_SUBJECT    your identity's subject in pki-manager (required)
#   PKI_TOKEN      OIDC bearer JWT     (required unless PKI_TOKEN_CMD is set)
#   PKI_TOKEN_CMD  command printing a bearer JWT to stdout
#   IDENTITY_FILE  SSH private key whose .pub is certified; default ~/.ssh/id_ed25519
#   PRINCIPAL      certificate principal; default iotgw-admin
#   VALID_FOR_SECONDS  cert TTL; default 86400 (24 h — decision-028 §1 iotgw-admin)
#   ZONE_ID        optional; narrows the identity lookup to one pki zone

set -euo pipefail

PKI_BASE_URL="${PKI_BASE_URL:-https://pki.joor.net}"
API="${PKI_BASE_URL%/}/api/v1"
IDENTITY_FILE="${IDENTITY_FILE:-$HOME/.ssh/id_ed25519}"
PRINCIPAL="${PRINCIPAL:-iotgw-admin}"
VALID_FOR_SECONDS="${VALID_FOR_SECONDS:-86400}"
ZONE_ID="${ZONE_ID:-}"
WANT_ZONE="${1:-}"   # informational label for output only

die() { echo "ssh-ca/user-cert: $*" >&2; exit 1; }

command -v curl >/dev/null || die "curl not found"
command -v python3 >/dev/null || die "python3 not found (used to parse pki-manager JSON)"

# --- credentials -----------------------------------------------------------
TOKEN="${PKI_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -n "${PKI_TOKEN_CMD:-}" ]; then
  TOKEN="$(eval "$PKI_TOKEN_CMD")" || die "PKI_TOKEN_CMD failed"
fi
[ -n "$TOKEN" ] || die "no OIDC token — set PKI_TOKEN (a bearer JWT) or PKI_TOKEN_CMD"
[ -n "${PKI_SUBJECT:-}" ] || die "PKI_SUBJECT is required (your identity's subject in pki-manager)"

# --- the public key to certify --------------------------------------------
PUB="$IDENTITY_FILE.pub"
[ -f "$PUB" ] || die "public key not found: $PUB (generate one, e.g. ssh-keygen -t ed25519 -f $IDENTITY_FILE)"
SSH_PUBKEY="$(tr -d '\n' < "$PUB")"

api_get() {
  curl -fsS -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" "$1"
}

# --- resolve identityId by subject ----------------------------------------
id_url="$API/ssh/identities"
[ -n "$ZONE_ID" ] && id_url="$id_url?zoneId=$ZONE_ID"
identities="$(api_get "$id_url")" || die "could not list identities (is the token valid / not expired?)"

IDENTITY_ID="$(
  SUBJECT="$PKI_SUBJECT" python3 - "$identities" <<'PY'
import json, os, sys
subject = os.environ["SUBJECT"]
try:
    data = json.loads(sys.argv[1])
except Exception:
    print("", end=""); sys.exit(0)
items = data if isinstance(data, list) else data.get("items") or data.get("identities") or []
for it in items:
    if not isinstance(it, dict):
        continue
    if it.get("subject") == subject or it.get("email") == subject or it.get("externalSubject") == subject:
        print(it.get("id") or it.get("identityId") or "", end="")
        break
PY
)"
[ -n "$IDENTITY_ID" ] || die "no identity found for subject '$PKI_SUBJECT'${ZONE_ID:+ in zone $ZONE_ID} — the backend creates it when a domain is provisioned (decision-026 phase 0)"

# --- request the certificate ----------------------------------------------
body="$(
  IDENTITY_ID="$IDENTITY_ID" SSH_PUBKEY="$SSH_PUBKEY" PRINCIPAL="$PRINCIPAL" \
  VALID_FOR_SECONDS="$VALID_FOR_SECONDS" python3 - <<'PY'
import json, os
print(json.dumps({
    "identityId": os.environ["IDENTITY_ID"],
    "sshPublicKey": os.environ["SSH_PUBKEY"],
    "principals": [os.environ["PRINCIPAL"]],
    "validForSeconds": int(os.environ["VALID_FOR_SECONDS"]),
}))
PY
)"

resp="$(
  curl -fsS -X POST "$API/ssh/users/issue" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body"
)" || die "pki-manager /ssh/users/issue failed (token scope? identity disabled? principal not entitled?)"

CERT="$(
  python3 - "$resp" <<'PY'
import json, sys
try:
    d = json.loads(sys.argv[1])
except Exception:
    print("", end=""); sys.exit(0)
# /ssh/users/issue wraps the cert in a `cert` object: {"cert":{"certOpenssh":…}}.
# Look there first, then at the top level, with a few defensive field-name
# fallbacks (the sign-host path uses `certOpenssh` too).
scopes = [d.get("cert"), d] if isinstance(d.get("cert"), dict) else [d]
for scope in scopes:
    for k in ("certOpenssh", "certificate", "cert", "opensshCertificate", "sshCertificate"):
        v = scope.get(k)
        if isinstance(v, str) and v.strip():
            print(v.strip(), end=""); sys.exit(0)
PY
)"
case "$CERT" in
  *-cert-v01@openssh.com*) : ;;
  *) die "pki-manager returned no OpenSSH certificate in the response body: ${resp:0:300}" ;;
esac

# --- install next to the key ----------------------------------------------
CERT_FILE="$IDENTITY_FILE-cert.pub"
umask 077
printf '%s\n' "$CERT" > "$CERT_FILE"
chmod 644 "$CERT_FILE"

echo "  ok   issued ${PRINCIPAL}${WANT_ZONE:+ for zone $WANT_ZONE} -> wrote $CERT_FILE"
if command -v ssh-keygen >/dev/null; then
  echo "  ---- certificate ----"
  ssh-keygen -L -f "$CERT_FILE" | grep -E 'Type|Public key|Signing CA|Key ID|Valid|Principals|.*:' | sed 's/^/  /' || true
fi

cat <<EOF

Done. OpenSSH loads '$CERT_FILE' automatically alongside '$IDENTITY_FILE'.
Connect with a certified name (host verification via scripts/ssh-ca/trust.sh):
  ssh -o HostKeyAlias=<device>.<domain>.iotgw root@<gateway ip>
To RENEW after expiry, just run this same command again — no new key is needed.
EOF
