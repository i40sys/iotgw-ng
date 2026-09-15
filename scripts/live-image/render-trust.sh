#!/usr/bin/env bash
# Render the SSH CA trust material overlay for the live image (task-095).
#
# Produces a small, reviewable overlay tree of *additions only* that
# `rebuild.sh --sync-from` rsyncs into `squashfs-root/`:
#
#   etc/ssh/ssh-user-ca.pub                    the concatenated User CA public
#                                              keys of every iotgw-ng zone
#                                              (active [+ rotating]) — 0444
#   etc/ssh/auth_principals/root               iotgw-admin, iotgw-ops       — 0644
#   etc/ssh/revoked_keys                       empty; sshd refuses to start if
#                                              RevokedKeys points at a missing
#                                              file (decision-026 3.12)       — 0600
#   etc/ssh/sshd_config.d/60-iotgw-ssh-ca.conf TrustedUserCAKeys / Authorized-
#                                              PrincipalsFile / RevokedKeys  — 0644
#   etc/ssh/sshd_config.d/50-iotgw-authorized-keys.conf  break-glass AuthorizedKeysFile,
#                                              sorts BEFORE 60- so file keys win — 0644
#
# The private-key removal and the unattributed break-glass trim are NOT here —
# those are tree mutations, done by `rebuild.sh --harden --drop-key-fp` so the
# overlay stays pure additions and re-renderable on CA rotation.
#
# Trust scope: EVERY zone's User CA (decision-028 §5) — safe on the isolated
# provisioning bench; revisit for a dedicated installer zone if used off-prem.
#
# Zone -> User CA id resolution (same pattern as trust.sh): the cluster
# `domains.pki_user_ca_id`, or DOMAIN_USER_CA_MAP="<zone>=<userCaId>[,...]".
# Each CA's public key is read UNAUTHENTICATED from the id-addressed public
# route /ssh/cas/:id/ca.pub (the zone-scoped trust routes are SPA-shadowed).
#
# Usage:
#   scripts/live-image/render-trust.sh [-o OUTDIR]
#   DOMAIN_USER_CA_MAP="iotgw-lab=515ce7b1-..." scripts/live-image/render-trust.sh
# Env: PKI_BASE_URL (default https://pki.joor.net), OUTDIR (default ./.trust-overlay)

set -euo pipefail

PKI_BASE_URL="${PKI_BASE_URL:-https://pki.joor.net}"
OUTDIR="${OUTDIR:-$(cd "$(dirname "$0")" && pwd)/.trust-overlay}"
while [ $# -gt 0 ]; do case "$1" in -o) OUTDIR="$2"; shift 2 ;; *) echo "unknown arg: $1" >&2; exit 2 ;; esac; done

die() { echo "render-trust: $*" >&2; exit 1; }
command -v curl >/dev/null || die "curl not found"

resolve_map() {
  if [ -n "${DOMAIN_USER_CA_MAP:-}" ]; then echo "$DOMAIN_USER_CA_MAP" | tr ',' '\n'; return; fi
  command -v kubectl >/dev/null || die "kubectl not found and DOMAIN_USER_CA_MAP is unset"
  kubectl -n supabase-db exec supabase-db-0 -c patroni -- \
    psql -U postgres -d postgres -At -F= -c \
    "SELECT pki_zone, pki_user_ca_id FROM domains WHERE pki_zone IS NOT NULL AND pki_user_ca_id IS NOT NULL ORDER BY pki_zone;" \
    2>/dev/null | grep -E '.+=.+' || die "no zone has a pki_user_ca_id yet"
}

rm -rf "$OUTDIR"
mkdir -p "$OUTDIR/etc/ssh/auth_principals" "$OUTDIR/etc/ssh/sshd_config.d"

UCA="$OUTDIR/etc/ssh/ssh-user-ca.pub"
: > "$UCA"
n=0
while IFS='=' read -r zone caid; do
  [ -n "$zone" ] && [ -n "$caid" ] || continue
  pub="$(curl -fsS -m 15 "$PKI_BASE_URL/ssh/cas/$caid/ca.pub" || true)"
  case "$pub" in
    ssh-*|ecdsa-*) : ;;
    *) die "no usable User CA key for zone '$zone' (id $caid) — got: ${pub:0:60}" ;;
  esac
  printf '%s\n' "$pub" >> "$UCA"
  echo "  ok   $zone user CA -> ssh-user-ca.pub ($(printf '%s' "$pub" | ssh-keygen -lf /dev/stdin 2>/dev/null | awk '{print $2}'))"
  n=$((n+1))
done < <(resolve_map)
[ "$n" -gt 0 ] || die "rendered no CA keys"
chmod 444 "$UCA"

printf 'iotgw-admin\niotgw-ops\n' > "$OUTDIR/etc/ssh/auth_principals/root"
chmod 644 "$OUTDIR/etc/ssh/auth_principals/root"

: > "$OUTDIR/etc/ssh/revoked_keys"
chmod 600 "$OUTDIR/etc/ssh/revoked_keys"

cat > "$OUTDIR/etc/ssh/sshd_config.d/60-iotgw-ssh-ca.conf" <<'EOF'
# iotgw-ng SSH CA trust (decision-024/025). Managed by scripts/live-image — do not edit.
# Accept user certificates signed by any iotgw-ng zone's User CA, mapping the
# certificate's principals through auth_principals, with a (currently empty) KRL.
TrustedUserCAKeys /etc/ssh/ssh-user-ca.pub
AuthorizedPrincipalsFile /etc/ssh/auth_principals/%u
RevokedKeys /etc/ssh/revoked_keys
EOF
chmod 644 "$OUTDIR/etc/ssh/sshd_config.d/60-iotgw-ssh-ca.conf"

cat > "$OUTDIR/etc/ssh/sshd_config.d/50-iotgw-authorized-keys.conf" <<'EOF'
# iotgw-ng break-glass (decision-025 §A / decision-028 §11). Managed — do not edit.
# Restated verbatim and sorted BEFORE 60- so the named raw break-glass keys keep
# working (sshd takes the first value it sees for AuthorizedKeysFile).
AuthorizedKeysFile .ssh/authorized_keys .ssh/authorized_keys2
EOF
chmod 644 "$OUTDIR/etc/ssh/sshd_config.d/50-iotgw-authorized-keys.conf"

echo "render-trust: overlay written to $OUTDIR"
find "$OUTDIR" -type f -printf '  %M %p\n' 2>/dev/null | sed "s#$OUTDIR/#  #"
