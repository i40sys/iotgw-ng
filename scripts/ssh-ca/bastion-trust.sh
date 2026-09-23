#!/usr/bin/env bash
# Install / refresh the iotgw-ng jump account on the Netmaker host (the SSH
# bastion). See decision-030 for the architecture.
#
# The controller (Kestra runner pods) has no L3 route into the per-network
# Netmaker/WireGuard subnets. It reaches gateways THROUGH the Netmaker host:
#   - ICMP reachability: `ssh iotgw-jump@bastion ping <gateway-ip>` — the ping
#     runs ON the Netmaker host, over its `netmaker` interface.
#   - SSH/Ansible: ProxyCommand `ssh -W <gateway>:22 iotgw-jump@bastion`.
#
# The account is deliberately narrow:
#   - auth ONLY by an SSH user certificate signed by one of the iotgw-ng zones'
#     User CAs with principal `iotgw-ops` (the runner's short-lived ops cert);
#     no password, no authorized_keys;
#   - every session is forced through iotgw-jump-cmd, which allows exactly
#     `ping <IPv4>`; no shell, no TTY, no agent/X11 forwarding;
#   - TCP forwarding is local-only and limited to port 22 (`-W host:22`).
# Root keeps its existing key-based access untouched: certificate logins only
# work for users that have a principals file, and only iotgw-jump has one.
#
# Re-run after creating a new domain so its User CA is trusted (idempotent).
#
# Usage: scripts/ssh-ca/bastion-trust.sh [root@216.45.62.117]
set -euo pipefail

BASTION="${1:-root@216.45.62.117}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
PKI_BASE_URL="${PKI_BASE_URL:-https://pki.joor.net}"
DB_POD="${DB_POD:-supabase-db-0}"

# 1. Every linked zone's User CA public key (public, id-addressed pki route —
#    same source as trust.sh). One key per line, de-duplicated.
cas="$(mktemp)"; trap 'rm -f "$cas"' EXIT
ids="$(kubectl -n supabase-db exec -i "$DB_POD" -c patroni -- \
  psql -U postgres -d postgres -X -At \
  -c "select distinct pki_user_ca_id from domains where pki_user_ca_id is not null order by 1")"
[ -n "$ids" ] || { echo "no domain has a pki_user_ca_id — nothing to trust" >&2; exit 1; }
for id in $ids; do
  key="$(curl -fsS "$PKI_BASE_URL/ssh/cas/$id/ca.pub")"
  case "$key" in ssh-*|ecdsa-*) ;; *) echo "bad CA key for $id" >&2; exit 1 ;; esac
  printf '%s iotgw-user-ca-%s\n' "$(awk '{print $1, $2}' <<<"$key")" "$id" >> "$cas"
done
sort -u -o "$cas" "$cas"
echo "trusting $(wc -l < "$cas") zone User CA(s)"

# 2. Push + install on the bastion; validate sshd before reloading, roll back on
#    failure so a mistake can never lock out root.
ssh -o BatchMode=yes "$BASTION" 'cat > /tmp/iotgw-user-cas.pub' < "$cas"
ssh -o BatchMode=yes "$BASTION" 'bash -s' <<'REMOTE'
set -euo pipefail
id iotgw-jump >/dev/null 2>&1 || useradd --system --create-home --shell /bin/sh iotgw-jump
passwd -l iotgw-jump >/dev/null

install -d -m 0755 /etc/ssh/iotgw /etc/ssh/iotgw/principals
install -m 0644 /tmp/iotgw-user-cas.pub /etc/ssh/iotgw/user-cas.pub
rm -f /tmp/iotgw-user-cas.pub
echo iotgw-ops > /etc/ssh/iotgw/principals/iotgw-jump
chmod 0644 /etc/ssh/iotgw/principals/iotgw-jump

cat > /usr/local/sbin/iotgw-jump-cmd <<'EOF'
#!/bin/sh
# Forced command for iotgw-jump (decision-030): the ONLY thing a session may do
# is ICMP-ping one IPv4 address over the Netmaker interfaces.
set -eu
cmd="${SSH_ORIGINAL_COMMAND:-}"
case "$cmd" in
  "ping "*) ip="${cmd#ping }" ;;
  *) echo "iotgw-jump: only 'ping <IPv4>' is allowed" >&2; exit 2 ;;
esac
echo "$ip" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$' || { echo "iotgw-jump: bad IPv4" >&2; exit 2; }
exec /bin/ping -n -c 3 -W 2 "$ip"
EOF
chmod 0755 /usr/local/sbin/iotgw-jump-cmd

conf=/etc/ssh/sshd_config.d/60-iotgw-jump.conf
[ -f "$conf" ] && cp -p "$conf" "$conf.bak"
cat > "$conf" <<'EOF'
# iotgw-ng jump account (decision-030) — managed by scripts/ssh-ca/bastion-trust.sh
TrustedUserCAKeys /etc/ssh/iotgw/user-cas.pub
# Certificate logins only for users with a principals file (only iotgw-jump);
# root's key-based access is unaffected.
AuthorizedPrincipalsFile /etc/ssh/iotgw/principals/%u

Match User iotgw-jump
    AuthorizedKeysFile none
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    PermitTTY no
    X11Forwarding no
    AllowAgentForwarding no
    AllowStreamLocalForwarding no
    AllowTcpForwarding local
    PermitOpen *:22
    ForceCommand /usr/local/sbin/iotgw-jump-cmd
EOF

if ! sshd -t; then
  echo "sshd -t FAILED — rolling back" >&2
  if [ -f "$conf.bak" ]; then mv "$conf.bak" "$conf"; else rm -f "$conf"; fi
  exit 1
fi
rm -f "$conf.bak"
systemctl reload ssh
echo "bastion: iotgw-jump installed, sshd reloaded"
REMOTE
