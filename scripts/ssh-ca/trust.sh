#!/usr/bin/env bash
# Operator-side SSH CA trust rollout (decision-024 §6, decision-027 phase 3).
#
# Installs, per iotgw-ng domain, an `@cert-authority` line for that domain's
# Host CA so you can verify any gateway in it WITHOUT collecting per-host
# fingerprints — and without `StrictHostKeyChecking no`.
#
# It writes only:
#   ~/.ssh/known_hosts.d/iotgw-<domain>   the @cert-authority line (one file per domain)
#   ~/.ssh/config.d/iotgw-ca.conf         a Host block scoped to *.iotgw
# and adds one `Include` line to ~/.ssh/config if it is not already there.
# It never edits ~/.ssh/known_hosts and never touches an unrelated Host block.
#
# Usage:
#   scripts/ssh-ca/trust.sh                 # every domain that has a pki_zone
#   scripts/ssh-ca/trust.sh warehouse       # one domain
#   PKI_BASE_URL=https://pki.joor.net scripts/ssh-ca/trust.sh
#
# Requires: the SOPS age key (to read the domain→CA mapping from the cluster) or
# DOMAIN_CA_MAP="<domain>=<hostCaId>[,<domain>=<hostCaId>...]" to skip the lookup.

set -euo pipefail

PKI_BASE_URL="${PKI_BASE_URL:-https://pki.joor.net}"
SSH_DIR="${SSH_DIR:-$HOME/.ssh}"
KH_DIR="$SSH_DIR/known_hosts.d"
CONF_DIR="$SSH_DIR/config.d"
CONF="$CONF_DIR/iotgw-ca.conf"
WANT_DOMAIN="${1:-}"

die() { echo "ssh-ca/trust: $*" >&2; exit 1; }

# --- resolve <domain> -> <host CA id> --------------------------------------
# Preferred source is the cluster, because `domains.pki_host_ca_id` is where the
# backend recorded the zone it created (decision-026 phase 0.5). DOMAIN_CA_MAP
# is the escape hatch for a workstation with no cluster access.
resolve_map() {
  if [ -n "${DOMAIN_CA_MAP:-}" ]; then
    echo "$DOMAIN_CA_MAP" | tr ',' '\n'
    return
  fi
  command -v kubectl >/dev/null || die "kubectl not found and DOMAIN_CA_MAP is unset"
  kubectl -n supabase-db exec supabase-db-0 -c patroni -- \
    psql -U postgres -d postgres -At -F= -c \
    "SELECT name, pki_host_ca_id FROM domains WHERE pki_zone IS NOT NULL AND pki_host_ca_id IS NOT NULL ORDER BY name;" \
    2>/dev/null | grep -E '^[a-z0-9-]+=' || die "no domain is linked to a pki-manager zone yet"
}

mkdir -p "$KH_DIR" "$CONF_DIR"
chmod 700 "$SSH_DIR" "$KH_DIR" "$CONF_DIR" 2>/dev/null || true

installed=0
while IFS='=' read -r domain ca_id; do
  [ -n "$domain" ] && [ -n "$ca_id" ] || continue
  if [ -n "$WANT_DOMAIN" ] && [ "$domain" != "$WANT_DOMAIN" ]; then continue; fi

  # /ssh/cas/:id/ca.pub is public and id-addressed, so it is zone-correct even
  # though the zone-scoped trust routes are SPA-shadowed on this deployment.
  ca_pub="$(curl -fsS "$PKI_BASE_URL/ssh/cas/$ca_id/ca.pub" || true)"
  case "$ca_pub" in
    ssh-*|ecdsa-*) : ;;
    *) echo "  SKIP $domain — $PKI_BASE_URL returned no usable CA key for $ca_id" >&2; continue ;;
  esac

  target="$KH_DIR/iotgw-$domain"
  line="@cert-authority *.$domain.iotgw $ca_pub"
  # Rewrite our own file wholesale — it holds exactly one line and nothing else,
  # so a CA rotation is picked up without any merge logic.
  printf '%s\n' "$line" > "$target"
  chmod 600 "$target"
  echo "  ok   $domain -> $target"
  installed=$((installed + 1))
done < <(resolve_map)

[ "$installed" -gt 0 ] || die "nothing installed"

# --- the ssh_config block ---------------------------------------------------
# `StrictHostKeyChecking yes` is set EXPLICITLY here because a global
# `Host *  StrictHostKeyChecking no` block is common in operator configs and
# would otherwise silently defeat host-certificate verification. OpenSSH takes
# the FIRST value it sees for a keyword, so this Include must come before any
# such catch-all — see the note printed below.
{
  echo "# Managed by iotgw-ng scripts/ssh-ca/trust.sh (decision-024 §6). Do not edit."
  echo "Host *.iotgw"
  echo "  StrictHostKeyChecking yes"
  printf '  UserKnownHostsFile'
  for f in "$KH_DIR"/iotgw-*; do printf ' %s' "$f"; done
  echo
  echo "  # Your user certificate, if you keep it next to your key, is picked up"
  echo "  # automatically as <IdentityFile>-cert.pub — see scripts/ssh-ca/user-cert.sh."
} > "$CONF"
chmod 600 "$CONF"
echo "  ok   $CONF"

if ! grep -q "^Include .*config.d/iotgw-ca.conf" "$SSH_DIR/config" 2>/dev/null; then
  tmp="$(mktemp)"
  { echo "Include $CONF"; [ -f "$SSH_DIR/config" ] && cat "$SSH_DIR/config"; } > "$tmp"
  mv "$tmp" "$SSH_DIR/config"
  chmod 600 "$SSH_DIR/config"
  echo "  ok   prepended 'Include $CONF' to $SSH_DIR/config"
  echo
  echo "NOTE: it was prepended deliberately. OpenSSH uses the first value it sees"
  echo "      for a keyword, so a later 'Host *  StrictHostKeyChecking no' block"
  echo "      can no longer override host-certificate verification for *.iotgw."
fi

cat <<EOF

Done. Verify with:
  ssh -G <device>.<domain>.iotgw | grep -E 'stricthostkeychecking|userknownhostsfile'
Then connect using a certified name, e.g.
  ssh -o HostKeyAlias=<device>.<domain>.iotgw root@<gateway ip>
A correct setup produces NO host-key prompt and adds NO known_hosts entry.
EOF
