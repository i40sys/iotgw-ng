#!/usr/bin/env bash
# Apply the iotgw live-image overlay to the netboot host and repack the
# squashfs with scripts/live-image/rebuild.sh (decision-031).
#
#   live-image/deploy.sh --init       # ONE-TIME: create the iotgw-live tree from BASE_TREE's served image
#   live-image/deploy.sh              # remove legacy paths, sync overlay, --stage a boot-testable candidate
#   live-image/deploy.sh --swap       # same, then install it as the served image (keeps .bak for rollback)
#
# The image has its own permanent tree, `iotgw-live/`, booted by the iPXE entry
# `iotgw-live` ("IoT gateway live provisioning"); new versions replace its
# filesystem.squashfs in place (--swap). The Clonezilla trees are not touched.
#
# Env: NETBOOT_HOST (root@10.2.0.3), TREE (iotgw-live), BASE_TREE (the Clonezilla
# 'VPN test' tree the image was derived from; --init only).
# NOTE: like every rebuild.sh --sync-from run, this MUTATES the tree's
# squashfs-root/ in place; --stage leaves the served filesystem.squashfs alone.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

NETBOOT_HOST="${NETBOOT_HOST:-root@10.2.0.3}"
TREE="${TREE:-iotgw-live}"
BASE_TREE="${BASE_TREE:-clonezilla-debian-3.1.2-9-2025-11-06}"
ASSETS="/opt/stacks/netbootxyz/assets"
MODE="--stage"
case "${1:-}" in
  --swap) MODE="--swap --yes" ;;
  --init)
    # Unpack BASE_TREE's SERVED image (not its possibly-edited squashfs-root/)
    # into a new tree, so iotgw-live starts from exactly what boots today.
    ssh -o BatchMode=yes "$NETBOOT_HOST" "set -e
      [ ! -e $ASSETS/$TREE ] || { echo 'tree $TREE already exists' >&2; exit 1; }
      mkdir -p $ASSETS/$TREE
      cp -a $ASSETS/$BASE_TREE/vmlinuz $ASSETS/$BASE_TREE/initrd $ASSETS/$BASE_TREE/filesystem.squashfs $ASSETS/$TREE/
      unsquashfs -q -n -d $ASSETS/$TREE/squashfs-root $ASSETS/$TREE/filesystem.squashfs
      echo 'created $ASSETS/$TREE from $BASE_TREE'"
    exit 0 ;;
esac

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
