#!/usr/bin/env bash
# Scripted, reviewable rebuild of the Clonezilla live-image squashfs (task-094).
#
# There is no build pipeline: on the netboot host (`y0`) the served image is a
# hand-unpacked `squashfs-root/` that must be repacked with `mksquashfs`. This
# script makes that one command, safe and idempotent:
#
#   1. repack `<tree>/squashfs-root/` into a *candidate* squashfs (matching the
#      current image's compression so behaviour and size do not drift);
#   2. verify what changed — extract the candidate and diff its CONTENT against
#      the currently-served image (`rsync -c`), so "it repacked" is backed by
#      "this is what actually changed";
#   3. only with --swap: install it atomically, keeping the previous image as
#      `filesystem.squashfs.bak` for rollback. If the content is identical to the
#      served image, the swap is skipped (idempotent — AC#4).
#
# Establishing that the served image matches `squashfs-root/` was done in
# task-094 AC#1: for both served trees the two agree byte-for-byte, so editing
# `squashfs-root/` and repacking here does change what boots.
#
# BOOT VERIFICATION (AC#3) is deliberately NOT automated: "it repacked" is not
# "it boots". Use --stage to publish the candidate under `<tree>-candidate/` and
# add a menu entry, boot ONE machine from it, confirm sshd, and only then --swap.
#
# Runs ON the netboot host (needs mksquashfs/unsquashfs/rsync + the assets dir).
#
# Usage (on y0, or: ssh root@y0 'bash -s' -- [args] < scripts/live-image/rebuild.sh):
#   scripts/live-image/rebuild.sh                     # build+verify primary tree, no swap
#   scripts/live-image/rebuild.sh --tree <name>       # pick a tree
#   scripts/live-image/rebuild.sh --sync-from DIR     # rsync DIR/ into squashfs-root/ first (trust material — task-095)
#   scripts/live-image/rebuild.sh --harden            # remove baked-in private key material (task-095 AC#1)
#   scripts/live-image/rebuild.sh --drop-key-fp FP    # drop an authorized_keys entry by fingerprint (task-107)
#   scripts/live-image/rebuild.sh --stage             # publish a boot-testable candidate, no swap
#   scripts/live-image/rebuild.sh --swap --yes        # install (skips if content-identical)
#
# The full task-095 rebuild (render then apply then stage for a boot test):
#   scripts/live-image/render-trust.sh -o /tmp/ovl
#   scripts/live-image/rebuild.sh --sync-from /tmp/ovl --harden \
#       --drop-key-fp SHA256:VMJ3HrTXUAmqTcnUPmJS4sTusMTcOLT8t424geeKfwg --stage
# NOTE: --sync-from/--harden/--drop-key-fp MUTATE squashfs-root/ in place (the
# intended workflow, decision-025). Complete the boot test + --swap, or restore
# squashfs-root/ from the served image, so the tree does not sit half-changed.
#
# Env: ASSETS_DIR (default /opt/stacks/netbootxyz/assets)

set -euo pipefail

ASSETS_DIR="${ASSETS_DIR:-/opt/stacks/netbootxyz/assets}"
TREE="${TREE:-clonezilla-debian-3.1.2-9-80072992}"
MODE="verify"          # verify | stage | swap
SYNC_FROM=""
ASSUME_YES=0
HARDEN=0
DROP_FPS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --tree) TREE="$2"; shift 2 ;;
    --sync-from) SYNC_FROM="$2"; shift 2 ;;
    --harden) HARDEN=1; shift ;;
    --drop-key-fp) DROP_FPS+=("$2"); shift 2 ;;
    --stage) MODE="stage"; shift ;;
    --swap) MODE="swap"; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    -h|--help) sed -n '2,44p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

log() { echo "live-image: $*"; }
die() { echo "live-image: $*" >&2; exit 1; }

for t in mksquashfs unsquashfs rsync; do command -v "$t" >/dev/null || die "$t not found (run this on the netboot host)"; done

DIR="$ASSETS_DIR/$TREE"
SROOT="$DIR/squashfs-root"
IMG="$DIR/filesystem.squashfs"
[ -d "$SROOT" ] || die "no squashfs-root/ in $DIR"
[ -f "$IMG" ]   || die "no filesystem.squashfs in $DIR"

# --- optional: sync trust material into squashfs-root/ (task-095) -----------
if [ -n "$SYNC_FROM" ]; then
  [ -d "$SYNC_FROM" ] || die "--sync-from '$SYNC_FROM' is not a directory"
  log "syncing $SYNC_FROM/ -> squashfs-root/"
  rsync -aH "$SYNC_FROM"/ "$SROOT"/
fi

# --- hardening: remove baked-in private key material (task-095 AC#1) --------
if [ "$HARDEN" -eq 1 ]; then
  removed=0
  for k in root/.ssh/id_ed25519 root/.ssh/id_ed25519.pub \
           root/.ssh/id_rsa root/.ssh/id_rsa.pub \
           root/.ssh/id_ecdsa root/.ssh/id_ecdsa.pub; do
    if [ -e "$SROOT/$k" ]; then rm -f "$SROOT/$k"; log "removed private key material: $k"; removed=$((removed+1)); fi
  done
  # Fail loud if anything private remains — the whole point of this task.
  if find "$SROOT/root/.ssh" -maxdepth 1 -type f -name 'id_*' ! -name '*.pub' 2>/dev/null | grep -q .; then
    die "private key material still present under root/.ssh after --harden"
  fi
  [ "$removed" -gt 0 ] || log "no baked-in private keys found (already clean)"
fi

# --- trim unattributed break-glass keys by fingerprint (task-107) ----------
AK="$SROOT/root/.ssh/authorized_keys"
if [ "${#DROP_FPS[@]}" -gt 0 ] && [ -f "$AK" ]; then
  command -v ssh-keygen >/dev/null || die "ssh-keygen needed to match --drop-key-fp"
  tmp="$(mktemp)"
  while IFS= read -r line; do
    case "$line" in ''|\#*) printf '%s\n' "$line" >> "$tmp"; continue ;; esac
    fp="$(printf '%s\n' "$line" | ssh-keygen -lf /dev/stdin 2>/dev/null | awk '{print $2}')"
    drop=0
    for want in "${DROP_FPS[@]}"; do [ "$fp" = "$want" ] && drop=1; done
    if [ "$drop" -eq 1 ]; then log "dropped break-glass key $fp from authorized_keys"; else printf '%s\n' "$line" >> "$tmp"; fi
  done < "$AK"
  install -m 600 "$tmp" "$AK"; rm -f "$tmp"
fi

# --- match the current image's compression so nothing drifts ---------------
COMP="$(unsquashfs -s "$IMG" 2>/dev/null | awk -F' ' '/^Compression/{print $2}')"
BS="$(unsquashfs -s "$IMG" 2>/dev/null | awk -F' ' '/^Block size/{print $3}')"
COMP="${COMP:-xz}"; BS="${BS:-1048576}"
log "tree=$TREE  compression=$COMP  block=$BS"

CAND="$DIR/filesystem.squashfs.candidate"
rm -f "$CAND"
log "repacking squashfs-root/ -> $(basename "$CAND") (this takes a minute)"
mksquashfs "$SROOT" "$CAND" -noappend -comp "$COMP" -b "$BS" -no-progress >/dev/null

# --- verify: what did the candidate actually change vs the served image? ----
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
unsquashfs -q -n -d "$TMP/served" "$IMG" >/dev/null 2>&1
unsquashfs -q -n -d "$TMP/cand"   "$CAND" >/dev/null 2>&1
# rsync -c compares content; exclude pseudo-fs and ignore dir-only entries.
DIFFS="$(rsync -aHni --checksum \
  --exclude=/dev --exclude=/proc --exclude=/sys --exclude=/run --exclude=/tmp \
  "$TMP/cand/" "$TMP/served/" 2>/dev/null | grep -vE '^\.d|/$' || true)"
NDIFF="$(printf '%s' "$DIFFS" | grep -c . || true)"

if [ "$NDIFF" -eq 0 ]; then
  log "candidate is CONTENT-IDENTICAL to the served image (no functional change)."
else
  log "candidate changes $NDIFF path(s) vs the served image:"
  printf '%s\n' "$DIFFS" | sed 's/^/    /' | head -60
fi

# --- act on the mode --------------------------------------------------------
case "$MODE" in
  verify)
    log "verify-only: candidate left at $CAND (no swap). Re-run with --stage or --swap."
    ;;
  stage)
    STAGE="$DIR-candidate"
    mkdir -p "$STAGE"
    cp -f "$CAND" "$STAGE/filesystem.squashfs"
    for extra in initrd vmlinuz; do [ -f "$DIR/$extra" ] && cp -f "$DIR/$extra" "$STAGE/$extra"; done
    log "staged a boot-testable candidate at: $STAGE"
    cat <<EOF
  Boot ONE machine from it before swapping. Add to config/menu.ipxe a copy of
  the :clonezilla-debian item with:
      set path /$(basename "$STAGE")/
  then boot that item and confirm sshd:
      ssh root@<machine> 'systemctl is-active ssh && sshd -t && echo SSHD_OK'
  When it boots and sshd is healthy, run this script again with --swap.
EOF
    ;;
  swap)
    if [ "$NDIFF" -eq 0 ]; then
      log "nothing to do — served image already matches squashfs-root/. Not swapping."
      rm -f "$CAND"
      exit 0
    fi
    if [ "$ASSUME_YES" -ne 1 ]; then
      printf 'live-image: swap in the candidate for %s? [y/N] ' "$TREE" >&2
      read -r ans; case "$ans" in y|Y|yes) : ;; *) die "aborted"; esac
    fi
    # atomic-ish: same filesystem, mv is rename(2). Keep one rollback level.
    cp -f --reflink=auto "$IMG" "$IMG.bak"
    mv -f "$CAND" "$IMG"
    log "installed new $IMG ; previous image retained as $IMG.bak"
    log "darkhttpd serves it read-only with no restart needed."
    ;;
esac
