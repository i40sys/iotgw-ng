#!/usr/bin/env bash
# tools/ssh-ca-smoke.sh — end-to-end SSH-CA smoke for `just verify` (task-099).
#
# Proves, against the LIVE stack, that:
#   1. the `ssh-ca` edge function answers and a device can ENROLL end-to-end
#      against a container acting as a gateway (host cert + User CA + drop-ins);
#   2. a backend-minted iotgw-ops USER certificate is ACCEPTED — asserted from
#      the gateway's sshd log, not merely a successful connection;
#   3. a per-host BLOCK denies that identity (KRL: "revoked by file") and an
#      UNBLOCK restores it.
#
# It is idempotent and self-cleaning (trap). It reuses the existing lab device
# `iot-gateway-warehouse` @ zone `iotgw-lab` for edge-fn enrollment AUTH — so it
# creates NO new device (no netmaker-call side effect) and never touches the
# production `default` zone (AC#4). Block/unblock uses a DEDICATED smoke identity,
# never the shared iotgw-ops one.
#
# Gated: SKIPs cleanly (rc 0) unless the kind cluster, Kong/edge-fn, pki-manager,
# docker and a suitable sshd image are all reachable — mirrors verify.sh §6.
set -euo pipefail
cd "$(dirname "$0")/.."

pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; SMOKE_RC=1; }
skip() { echo "  SKIP  $1"; }
SMOKE_RC=0

# ── config ──────────────────────────────────────────────────────────────────
KONG="${KONG_URL:-http://localhost:8000}"
PKI="${PKI_BASE_URL:-https://pki.joor.net}"
IMG="${SSH_CA_SMOKE_IMAGE:-ssh-cert-test:latest}"
CTR="${SSH_CA_SMOKE_CONTAINER:-iotgw-ssh-ca-smoke}"
PORT="${SSH_CA_SMOKE_PORT:-12222}"
ZONE="iotgw-lab"
DEVICE_NAME="iot-gateway-warehouse"
SMOKE_SUBJECT="iotgw-verify-smoke"          # fixed, reused → no per-run accumulation
KRL_CLIENT="${KRL_CLIENT:-$HOME/ssh-cert-test/krl-client}"
SSHD_LOG=/var/log/sshd.log
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
WORK="$(mktemp -d)"
CACHE="${SSH_CA_SMOKE_CACHE:-$HOME/.cache/iotgw-ssh-ca-smoke}"; mkdir -p "$CACHE"

HOST_ID=""; SMOKE_IID=""; FQDN=""

cleanup() {
  set +e
  # best-effort unblock so a fixed identity never stays revoked
  [ -n "$HOST_ID" ] && [ -n "$SMOKE_IID" ] && pki POST /ssh/blocks/unblock \
    "{\"hostId\":\"$HOST_ID\",\"identityId\":\"$SMOKE_IID\"}" >/dev/null 2>&1
  docker rm -f "$CTR" >/dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup EXIT

# ── gating ──────────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || { skip "ssh-ca smoke: docker unavailable"; exit 0; }
command -v sops   >/dev/null 2>&1 || { skip "ssh-ca smoke: sops unavailable"; exit 0; }
kubectl cluster-info >/dev/null 2>&1 || { skip "ssh-ca smoke: kube cluster unreachable"; exit 0; }
EDGE_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 -X POST "$KONG/functions/v1/ssh-ca" 2>/dev/null || echo 000)
[ "$EDGE_CODE" != "000" ] || { skip "ssh-ca smoke: Kong/edge-fn unreachable"; exit 0; }
curl -fsS -o /dev/null --max-time 10 "$PKI/api/v1/openapi.json" 2>/dev/null || { skip "ssh-ca smoke: pki-manager unreachable"; exit 0; }
docker image inspect "$IMG" >/dev/null 2>&1 || { skip "ssh-ca smoke: image '$IMG' not present (set SSH_CA_SMOKE_IMAGE)"; exit 0; }
[ -x "$KRL_CLIENT" ] || { skip "ssh-ca smoke: krl-client not found at $KRL_CLIENT (set KRL_CLIENT)"; exit 0; }

echo "  ..    ssh-ca smoke: edge-fn HTTP $EDGE_CODE, pki reachable, image $IMG"

# ── secrets + pki-manager operator token ────────────────────────────────────
BE_ENV="$(sops -d secrets/iotgw-ui-backend.enc.env)"
sops_val() { printf '%s\n' "$BE_ENV" | grep -E "^$1=" | head -1 | cut -d= -f2-; }
PKI_TOKEN_URL="$(sops_val PKI_OIDC_TOKEN_URL)"
PKI_CID="$(sops_val PKI_OIDC_CLIENT_ID)"
PKI_CSEC="$(sops_val PKI_OIDC_CLIENT_SECRET)"
ANON="$(sops -d secrets/supabase.enc.env | grep -E '^ANON_KEY=' | head -1 | cut -d= -f2-)"
PKI_TOKEN="$(curl -fsS -X POST "$PKI_TOKEN_URL" \
  -d grant_type=client_credentials -d client_id="$PKI_CID" -d client_secret="$PKI_CSEC" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')"

pki() { # <METHOD> <path> [json-body] → stdout body; nonzero on HTTP >=400
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -fsS -X "$method" "$PKI/api/v1$path" -H "Authorization: Bearer $PKI_TOKEN" \
      -H 'Content-Type: application/json' -H 'Accept: application/json' -d "$body"
  else
    curl -fsS -X "$method" "$PKI/api/v1$path" -H "Authorization: Bearer $PKI_TOKEN" -H 'Accept: application/json'
  fi
}

# ── lab device ids + current TOTP (edge-fn auth; no new device created) ──────
DEVLINE="$(kubectl -n supabase-db exec supabase-db-0 -c patroni -- psql -U postgres -d postgres -At -q -P pager=off -F' ' -c \
  "select d.id, n.id, dom.id, d.totp_counter, left(n.id::text,8) from devices d join networks n on d.network_id=n.id join domains dom on n.domain_id=dom.id where d.name='$DEVICE_NAME' and dom.pki_zone='$ZONE' limit 1;" 2>/dev/null \
  | grep -Ev 'Pager usage|^$' | tail -1)"
read -r DEV_UUID NET_ID DOM_ID COUNTER NET_PREFIX <<<"$DEVLINE"
if [ -z "${DEV_UUID:-}" ]; then fail "ssh-ca smoke: lab device $DEVICE_NAME @ $ZONE not found in DB"; exit "$SMOKE_RC"; fi
DEVICE_ID="${DEVICE_NAME}@${NET_PREFIX}"
TOTP="$(python3 - "$DOM_ID" "$NET_ID" "$DEV_UUID" "$COUNTER" <<'PY'
import hmac, hashlib, struct, time, sys
dom, net, dev, ctr = sys.argv[1:5]
secret = f"{dom}-{net}-{dev}-{ctr}".encode()
h = hmac.new(secret, struct.pack(">Q", int(time.time()) // 600), hashlib.sha1).digest()
o = h[-1] & 0x0f
b = ((h[o] & 0x7f) << 24) | ((h[o+1] & 0xff) << 16) | ((h[o+2] & 0xff) << 8) | (h[o+3] & 0xff)
print(str(b % 1000000).zfill(6))
PY
)"

# ── gateway container ───────────────────────────────────────────────────────
docker rm -f "$CTR" >/dev/null 2>&1 || true
docker run -d --name "$CTR" -p "127.0.0.1:$PORT:22" "$IMG" sleep infinity >/dev/null
docker cp "$KRL_CLIENT" "$CTR":/usr/local/bin/krl-client >/dev/null
docker exec "$CTR" chmod 0755 /usr/local/bin/krl-client

# stable ecdsa host key across runs (cached) → idempotent (zone,fqdn) host record
if [ ! -f "$CACHE/host_ecdsa_key" ]; then
  ssh-keygen -q -t ecdsa -b 256 -N '' -f "$CACHE/host_ecdsa_key" -C "$CTR"
fi
docker cp "$CACHE/host_ecdsa_key"     "$CTR":/etc/ssh/ssh_host_ecdsa_key
docker cp "$CACHE/host_ecdsa_key.pub" "$CTR":/etc/ssh/ssh_host_ecdsa_key.pub
docker exec "$CTR" chmod 600 /etc/ssh/ssh_host_ecdsa_key
HOST_PUB="$(docker exec "$CTR" cat /etc/ssh/ssh_host_ecdsa_key.pub)"

# Reset the recorded host pubkey so [1/4] is deterministically a FIRST enroll
# (the cached host key would otherwise make a re-run a re-enroll). task-075.
kubectl -n supabase-db exec supabase-db-0 -c patroni -- psql -U postgres -d postgres -q -P pager=off -c \
  "update devices set ssh_host_pubkey=null where id='$DEV_UUID';" >/dev/null 2>&1 || true

# ── [1/4] enroll via the ssh-ca EDGE FUNCTION (AC#1) ────────────────────────
REQ="$(python3 -c 'import json,sys;print(json.dumps({"device_id":sys.argv[1],"action":"enroll","host_pubkey":sys.argv[2]}))' "$DEVICE_ID" "$HOST_PUB")"
ENC_URL="$KONG/functions/v1/ssh-ca?device_id=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$DEVICE_ID")"
if ENROLL="$(printf '%s' "$REQ" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass "pass:$TOTP" \
  | curl -fsS -m 30 -X POST "$ENC_URL" -H "Authorization: Bearer $ANON" \
      -H 'Content-Type: application/octet-stream' --data-binary @- \
  | openssl enc -d -aes-256-cbc -pbkdf2 -iter 300000 -pass "pass:$TOTP" 2>/dev/null)" \
  && [ -n "$ENROLL" ] && printf '%s' "$ENROLL" | python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("host_cert") and d.get("user_ca")' 2>/dev/null; then
  pass "ssh-ca edge function enrolled the gateway (host cert + User CA returned)"
else
  fail "ssh-ca edge function enrollment FAILED (edge-fn broken or device cannot enroll)"
  exit "$SMOKE_RC"
fi

# parse the enrollment bundle (write to a file first — python reads it by path,
# so stdin stays free and there is no heredoc/pipe clash)
printf '%s' "$ENROLL" > "$WORK/enroll.json"
eval "$(python3 - "$WORK" <<'PY'
import sys, json, shlex, os
w = sys.argv[1]
d = json.load(open(os.path.join(w, "enroll.json")))
for k in ("host_cert", "user_ca", "host_ca"):
    open(os.path.join(w, k), "w").write(d[k])
print("FQDN=" + shlex.quote(d.get("fqdn", "")))
print("HOST_ID=" + shlex.quote(str(d.get("host_id", ""))))
PY
)"

# ── [1b/4] re-enroll requires proof-of-continuity (AC#4, task-075) ───────────
# The enroll above recorded ssh_host_pubkey, so a re-enroll must now prove
# possession of the existing host key: without a continuity_sig → 401; with a
# valid SSHSIG (namespace iotgw-reenroll) signed by that key → accepted.
NORM_PUB="$(printf '%s' "$HOST_PUB" | awk '{print $1" "$2}')"
REQ_RE="$(python3 -c 'import json,sys;print(json.dumps({"device_id":sys.argv[1],"action":"enroll","host_pubkey":sys.argv[2]}))' "$DEVICE_ID" "$HOST_PUB")"
CODE_NP="$(printf '%s' "$REQ_RE" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass "pass:$TOTP" \
  | curl -s -o /dev/null -w '%{http_code}' -m 30 -X POST "$ENC_URL" -H "Authorization: Bearer $ANON" \
      -H 'Content-Type: application/octet-stream' --data-binary @- 2>/dev/null)"
if [ "$CODE_NP" = "401" ]; then
  pass "re-enroll WITHOUT proof-of-continuity is rejected (HTTP 401)"
else
  fail "re-enroll without proof was NOT rejected (HTTP $CODE_NP; expected 401)"
fi
docker exec "$CTR" sh -c "printf '%s\n%s\n%s' '$DEVICE_ID' '$NORM_PUB' '$TOTP' > /tmp/reench && ssh-keygen -Y sign -f /etc/ssh/ssh_host_ecdsa_key -n iotgw-reenroll /tmp/reench >/dev/null 2>&1"
CONT_SIG="$(docker exec "$CTR" cat /tmp/reench.sig)"
REQ_RP="$(python3 -c 'import json,sys;print(json.dumps({"device_id":sys.argv[1],"action":"enroll","host_pubkey":sys.argv[2],"continuity_sig":sys.argv[3]}))' "$DEVICE_ID" "$HOST_PUB" "$CONT_SIG")"
if REENR="$(printf '%s' "$REQ_RP" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt -pass "pass:$TOTP" \
  | curl -fsS -m 30 -X POST "$ENC_URL" -H "Authorization: Bearer $ANON" \
      -H 'Content-Type: application/octet-stream' --data-binary @- \
  | openssl enc -d -aes-256-cbc -pbkdf2 -iter 300000 -pass "pass:$TOTP" 2>/dev/null)" \
  && printf '%s' "$REENR" | python3 -c 'import sys,json;assert json.load(sys.stdin).get("host_cert")' 2>/dev/null; then
  pass "re-enroll WITH valid proof-of-continuity is accepted (fresh host cert)"
else
  fail "re-enroll with valid proof was NOT accepted"
fi

# ── install trust material + sshd drop-in, then start sshd with a file log ───
docker cp "$WORK/host_cert" "$CTR":/etc/ssh/ssh_host_ecdsa_key-cert.pub
docker cp "$WORK/user_ca"   "$CTR":/etc/ssh/ssh-user-ca.pub
docker cp "$WORK/host_ca"   "$CTR":/etc/ssh/ssh-host-ca.pub
cat > "$WORK/60-iotgw-ssh-ca.conf" <<'EOF'
PermitRootLogin prohibit-password
PubkeyAuthentication yes
PasswordAuthentication no
HostKey /etc/ssh/ssh_host_ecdsa_key
HostCertificate /etc/ssh/ssh_host_ecdsa_key-cert.pub
TrustedUserCAKeys /etc/ssh/ssh-user-ca.pub
AuthorizedPrincipalsFile /etc/ssh/auth_principals/%u
RevokedKeys /etc/ssh/revoked_keys
EOF
docker cp "$WORK/60-iotgw-ssh-ca.conf" "$CTR":/etc/ssh/sshd_config.d/60-iotgw-ssh-ca.conf
docker exec "$CTR" bash -c '
  set -e
  rm -f /etc/ssh/sshd_config.d/50-* 2>/dev/null || true
  chmod 0444 /etc/ssh/ssh_host_ecdsa_key-cert.pub /etc/ssh/ssh-user-ca.pub /etc/ssh/ssh-host-ca.pub
  mkdir -p /etc/ssh/auth_principals /run/sshd
  printf "iotgw-admin\niotgw-ops\n" > /etc/ssh/auth_principals/root
  [ -f /etc/ssh/revoked_keys ] || install -m 0444 /dev/null /etc/ssh/revoked_keys
  /usr/sbin/sshd -t'
restart_sshd() {
  docker exec "$CTR" bash -c "
    pkill -x sshd 2>/dev/null || true; : > $SSHD_LOG
    for _ in \$(seq 1 40); do ss -ltn 'sport = :22' 2>/dev/null | grep -q LISTEN || break; sleep 0.1; done
    /usr/sbin/sshd -E $SSHD_LOG -o LogLevel=VERBOSE
    for _ in \$(seq 1 40); do ss -ltn 'sport = :22' 2>/dev/null | grep -q LISTEN && exit 0; sleep 0.1; done
    echo 'sshd failed to listen' >&2; exit 1"
}
restart_sshd

# ── smoke user identity + iotgw-ops user cert ───────────────────────────────
# NB: POST /ssh/identities takes the zone NAME, but GET /ssh/identities filters by
# zone UUID — resolve it. Idempotent: reuse the fixed smoke identity if present.
ZONE_UUID="$(pki GET /ssh/zones | python3 -c \
  'import sys,json;d=json.load(sys.stdin);L=d if isinstance(d,list) else d.get("items",[]);print(next((z["id"] for z in L if z.get("name")==sys.argv[1]),""))' "$ZONE")"
find_iid() { pki GET "/ssh/identities?zoneId=$ZONE_UUID" | python3 -c \
  'import sys,json;d=json.load(sys.stdin);L=d if isinstance(d,list) else d.get("items",[]);print(next((i["id"] for i in L if i.get("subject")==sys.argv[1]),""))' "$SMOKE_SUBJECT"; }
SMOKE_IID="$(find_iid)"
if [ -z "$SMOKE_IID" ]; then
  pki POST /ssh/identities "{\"subject\":\"$SMOKE_SUBJECT\",\"zone\":\"$ZONE\"}" >/dev/null 2>&1 || true
  SMOKE_IID="$(find_iid)"
fi
[ -n "$SMOKE_IID" ] || { fail "ssh-ca smoke: could not resolve/create the smoke identity"; exit "$SMOKE_RC"; }
# baseline: ensure not left blocked from a prior aborted run
pki POST /ssh/blocks/unblock "{\"hostId\":\"$HOST_ID\",\"identityId\":\"$SMOKE_IID\"}" >/dev/null 2>&1 || true

ssh-keygen -q -t ed25519 -N '' -f "$WORK/uid" -C "$SMOKE_SUBJECT"
USER_PUB="$(cat "$WORK/uid.pub")"
pki POST /ssh/users/issue \
  "$(python3 -c 'import json,sys;print(json.dumps({"identityId":sys.argv[1],"sshPublicKey":sys.argv[2],"principals":["iotgw-ops"],"validForSeconds":7200}))' "$SMOKE_IID" "$USER_PUB")" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);c=d.get("cert",d);open(sys.argv[1],"w").write((c.get("certOpenssh") or c.get("certificate")).rstrip()+"\n")' "$WORK/uid-cert.pub"

login() { # → prints "ok"/"deny"
  if ssh -i "$WORK/uid" -o CertificateFile="$WORK/uid-cert.pub" -o IdentitiesOnly=yes \
       -o PreferredAuthentications=publickey -o PasswordAuthentication=no -o BatchMode=yes \
       -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 \
       -p "$PORT" root@127.0.0.1 true >/dev/null 2>&1; then echo ok; else echo deny; fi
}
logline() { docker exec "$CTR" sh -c "grep -aE '$1' $SSHD_LOG 2>/dev/null | tail -1"; }

# ── [2/4] cert accepted — asserted from the sshd log (AC#2) ─────────────────
if [ "$(login)" = "ok" ] && logline 'Accepted (publickey|certificate).*(CERT|ID .*serial)' >/dev/null 2>&1 \
   && [ -n "$(logline 'Accepted (publickey|certificate)')" ]; then
  pass "iotgw-ops user certificate accepted by the gateway sshd ($(logline 'Accepted (publickey|certificate)' | sed 's/.*sshd/sshd/' | cut -c1-70))"
else
  fail "iotgw-ops user certificate was NOT accepted (or not visible in the sshd log)"
fi

# ── [3/4] block → denied via KRL (AC#3) ─────────────────────────────────────
pki POST /ssh/blocks "{\"hostId\":\"$HOST_ID\",\"identityId\":\"$SMOKE_IID\",\"reason\":\"verify smoke\"}" >/dev/null
docker exec "$CTR" /usr/local/bin/krl-client --server-url "$PKI" --host-id "$FQDN" >/dev/null 2>&1 || true
docker exec "$CTR" bash -c "pkill -HUP sshd 2>/dev/null || true; : > $SSHD_LOG"  # fresh log window
if [ "$(login)" = "deny" ] && [ -n "$(logline 'revoked by file|Certificate invalid|revoked')" ]; then
  pass "block denies the identity via the KRL ($(logline 'revoked' | sed 's/.*sshd/sshd/' | cut -c1-60))"
else
  fail "block did NOT deny the identity (KRL not enforced: $(logline 'revoked'))"
fi

# ── [4/4] unblock → restored (AC#3) ─────────────────────────────────────────
pki POST /ssh/blocks/unblock "{\"hostId\":\"$HOST_ID\",\"identityId\":\"$SMOKE_IID\"}" >/dev/null
docker exec "$CTR" /usr/local/bin/krl-client --server-url "$PKI" --host-id "$FQDN" >/dev/null 2>&1 || true
docker exec "$CTR" bash -c "pkill -HUP sshd 2>/dev/null || true; : > $SSHD_LOG"
if [ "$(login)" = "ok" ] && [ -n "$(logline 'Accepted (publickey|certificate)')" ]; then
  pass "unblock restores certificate access"
else
  fail "unblock did NOT restore access"
fi

exit "$SMOKE_RC"
