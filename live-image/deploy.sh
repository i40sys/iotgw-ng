#!/usr/bin/env bash
# Apply the iotgw live-image overlay to the netboot host and repack the
# squashfs with scripts/live-image/rebuild.sh (decision-031).
#
#   live-image/deploy.sh              # remove legacy paths, sync overlay, --stage a boot-testable candidate
#   live-image/deploy.sh --swap       # same, then install it as the served image (keeps .bak for rollback)
#
# Env: NETBOOT_HOST (root@10.2.0.3), TREE (the 'VPN test' tree).
# NOTE: like every rebuild.sh --sync-from run, this MUTATES the tree's
# squashfs-root/ in place; --stage leaves the served filesystem.squashfs alone.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

NETBOOT_HOST="${NETBOOT_HOST:-root@10.2.0.3}"
TREE="${TREE:-clonezilla-debian-3.1.2-9-2025-11-06}"
MODE="--stage"
[ "${1:-}" = "--swap" ] && MODE="--swap --yes"

[ -f dist/iotgw-live-overlay.tar.gz ] || { echo "run live-image/build.sh first" >&2; exit 1; }

REMOTE_DIR=/tmp/iotgw-live-overlay
ssh -o BatchMode=yes "$NETBOOT_HOST" "rm -rf $REMOTE_DIR && mkdir -p $REMOTE_DIR"
ssh -o BatchMode=yes "$NETBOOT_HOST" "tar -xzf - -C $REMOTE_DIR --numeric-owner" < dist/iotgw-live-overlay.tar.gz

args=(--tree "$TREE" --sync-from "$REMOTE_DIR")
while IFS= read -r line; do
  case "$line" in ''|\#*) continue ;; esac
  args+=(--remove "$line")
done < dist/remove.list
# shellcheck disable=SC2206
args+=($MODE)

echo "==> rebuild.sh ${args[*]}"
ssh -o BatchMode=yes "$NETBOOT_HOST" "bash -s -- ${args[*]}" < ../scripts/live-image/rebuild.sh
