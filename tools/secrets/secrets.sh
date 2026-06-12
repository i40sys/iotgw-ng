#!/usr/bin/env bash
# secrets.sh — thin wrapper around SOPS+age for the iotgw-ng workspace.
#
# Encrypted secrets live in secrets/*.enc.{env,yaml}. The age private key is at
# $SOPS_AGE_KEY_FILE (default ~/.config/sops/age/keys.txt) and is NEVER committed.
#
# Usage:
#   tools/secrets/secrets.sh render            # decrypt every secrets/*.enc.env
#                                              # to its consuming plaintext .env
#   tools/secrets/secrets.sh render <name>     # render one (e.g. supabase)
#   tools/secrets/secrets.sh edit <name>       # sops-edit secrets/<name>.enc.env
#   tools/secrets/secrets.sh cat <name>        # print decrypted (careful!)
#   tools/secrets/secrets.sh reencrypt <name>  # re-encrypt the consuming .env
#                                              # back into secrets/<name>.enc.env
#   tools/secrets/secrets.sh check             # verify every encrypted file
#                                              # round-trips and has no cleartext
#   tools/secrets/secrets.sh k8s <name> <ns> <secretname>
#                                              # emit a sops-decrypted k8s Secret
#
# The name→destination map below is the single source of truth for where each
# decrypted .env lands for local docker-compose / pnpm dev.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"

# name -> plaintext destination consumed by the stack at runtime
declare -A DEST=(
  [supabase]="supabase/.env"
  [kestra]="kestra/.env"
  [netmaker]="ansible/netmaker/.env"
  [kestra-reporter]="kestra/kestra-ansible-reporter/.env"
  [iotgw-ui-root]="iotgw-ui/.env"
  [iotgw-ui-backend]="iotgw-ui/apps/backend/.env"
)

have() { command -v "$1" >/dev/null 2>&1; }
need() { have sops || { echo "sops not found (install to ~/.local/bin)"; exit 1; }; }

render_one() {
  local name="$1"
  local src="secrets/${name}.enc.env" dst="${DEST[$name]:-}"
  [ -f "$src" ] || { echo "no such encrypted file: $src"; return 1; }
  [ -n "$dst" ] || { echo "no destination mapped for '$name'"; return 1; }
  mkdir -p "$(dirname "$dst")"
  sops --decrypt --input-type dotenv --output-type dotenv "$src" > "$dst"
  chmod 600 "$dst"
  echo "rendered $src -> $dst"
}

reencrypt_one() {
  local name="$1"
  local dst="secrets/${name}.enc.env" src="${DEST[$name]:-}"
  [ -f "$src" ] || { echo "no plaintext to re-encrypt: $src"; return 1; }
  cp "$src" "$dst"
  sops --encrypt --in-place --input-type dotenv --output-type dotenv "$dst"
  echo "re-encrypted $src -> $dst"
}

cmd="${1:-}"; shift || true
need
case "$cmd" in
  render)
    if [ $# -ge 1 ]; then render_one "$1"; else for n in "${!DEST[@]}"; do render_one "$n" || true; done; fi ;;
  reencrypt)
    [ $# -ge 1 ] || { echo "usage: reencrypt <name>"; exit 1; }; reencrypt_one "$1" ;;
  edit)
    [ $# -ge 1 ] || { echo "usage: edit <name>"; exit 1; }; sops "secrets/$1.enc.env" ;;
  cat)
    [ $# -ge 1 ] || { echo "usage: cat <name>"; exit 1; }; sops --decrypt "secrets/$1.enc.env" ;;
  k8s)
    [ $# -ge 3 ] || { echo "usage: k8s <name> <namespace> <secret-name>"; exit 1; }
    name="$1"; ns="$2"; sname="$3"
    tmp="$(mktemp)"; sops --decrypt --input-type dotenv --output-type dotenv "secrets/${name}.enc.env" > "$tmp"
    kubectl create secret generic "$sname" -n "$ns" --from-env-file="$tmp" --dry-run=client -o yaml
    rm -f "$tmp" ;;
  check)
    rc=0
    for src in secrets/*.enc.env; do
      [ -e "$src" ] || continue
      if sops --decrypt --input-type dotenv --output-type dotenv "$src" >/dev/null 2>&1; then
        echo "OK   $src (decrypts, $(grep -c 'ENC\[' "$src") encrypted values)"
      else
        echo "FAIL $src (cannot decrypt — wrong/missing age key?)"; rc=1
      fi
      # leak check: known sentinels must NOT appear in cleartext
      for s in The2password NBMtSWau sk-proj AIzaSy BEGIN.PRIVATE; do
        grep -Eq "$s" "$src" && { echo "  LEAK: cleartext '$s' in $src"; rc=1; }
      done
    done
    for src in secrets/*.enc.yaml; do
      [ -e "$src" ] || continue
      sops --decrypt "$src" >/dev/null 2>&1 && echo "OK   $src (decrypts)" || { echo "FAIL $src"; rc=1; }
    done
    exit $rc ;;
  *)
    sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 1 ;;
esac
