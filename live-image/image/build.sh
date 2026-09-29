#!/usr/bin/env bash
# Build the bootable iotgw live image from PINNED upstream Clonezilla
# (task-149.01): vmlinuz + initrd + filesystem.squashfs, with the iotgw overlay
# applied and NO SSH key material. Runs as root inside a Debian container (CI
# and local: `just image` wraps it in docker):
#   build.sh <overlay.tar.gz> <remove.list> <out-dir> [<cache-dir>]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
overlay="$(realpath "$1")"; remove_list="$(realpath "$2")"; out="$3"
cache="${4:-/tmp/iotgw-image-cache}"
# shellcheck source=pins.env
. "$here/pins.env"
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(date +%s)}"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$out" "$cache"
out="$(realpath "$out")"

fetch() { # <url> <sha256>  -> prints the verified path in the cache
  local f="$cache/$2"
  if [ ! -s "$f" ]; then curl -fsSL --retry 3 -o "$f.part" "$1" && mv "$f.part" "$f"; fi
  echo "$2  $f" | sha256sum -c --quiet - || { echo "checksum mismatch: $1" >&2; rm -f "$f"; exit 1; }
  printf '%s' "$f"
}

echo "==> fetching pinned inputs"
zip="$(fetch "$CLONEZILLA_URL" "$CLONEZILLA_SHA256")"
wgdeb="$(fetch "$WIREGUARD_TOOLS_URL" "$WIREGUARD_TOOLS_SHA256")"
curltar="$(fetch "$STATIC_CURL_URL" "$STATIC_CURL_SHA256")"
cacert="$(fetch "$CACERT_URL" "$CACERT_SHA256")"

echo "==> unpacking Clonezilla $CLONEZILLA_VERSION"
unzip -q -o "$zip" 'live/vmlinuz' 'live/initrd.img' 'live/filesystem.squashfs' -d "$work/zip"
R="$work/rootfs"
unsquashfs -q -n -d "$R" "$work/zip/live/filesystem.squashfs" >/dev/null

echo "==> applying the iotgw overlay + remove.list"
tar -xzf "$overlay" -C "$R" --numeric-owner --no-overwrite-dir
while IFS= read -r p; do
  case "$p" in ''|\#*) continue ;; esac
  rm -rf "${R:?}/${p#/}"
done < "$remove_list"

echo "==> installing wireguard-tools (pinned)"
cp "$wgdeb" "$R/tmp/wireguard-tools.deb"
chroot "$R" dpkg -i /tmp/wireguard-tools.deb >/dev/null
rm -f "$R/tmp/wireguard-tools.deb"

echo "==> enabling sshd at boot (root by certificate only: 40-iotgw-root-login.conf)"
chroot "$R" systemctl enable ssh.service >/dev/null 2>&1

echo "==> stripping SSH key material and build leftovers"
rm -f "$R"/etc/ssh/ssh_host_*_key "$R"/etc/ssh/ssh_host_*_key.pub
rm -f "$R"/root/.ssh/authorized_keys "$R"/root/.ssh/authorized_keys2 "$R"/root/.bash_history
"$here/check-no-keys.sh" "$R"

echo "==> repacking filesystem.squashfs (xz, 1 MiB blocks)"
# squashfs-tools takes every timestamp from SOURCE_DATE_EPOCH (reproducible).
mksquashfs "$R" "$out/filesystem.squashfs" -noappend -comp xz -b 1M -no-progress >/dev/null

echo "==> initrd: static curl + CA bundle so live-boot fetches over HTTPS"
I="$work/initrd"; mkdir -p "$I"
( cd "$I" && xz -dc "$work/zip/live/initrd.img" | cpio -idm --quiet )
tar -xJf "$curltar" -C "$work" curl
install -m 0755 "$work/curl" "$I/bin/curl"
mkdir -p "$I/etc/ssl/certs"
install -m 0644 "$cacert" "$I/etc/ssl/certs/ca-certificates.crt"
patched=0
# shellcheck disable=SC2016 # literal shell text of the live-boot script
old='wget "${url}" -O "${dest}/$(basename ${url})"'
# shellcheck disable=SC2016
new='/bin/curl -fsSL --retry 3 --cacert /etc/ssl/certs/ca-certificates.crt "${url}" -o "${dest}/$(basename ${url})"'
# lib may be a merged-usr symlink to usr/lib: patch each REAL file once.
for s in $(for c in "$I/lib/live/boot/9990-mount-http.sh" "$I/usr/lib/live/boot/9990-mount-http.sh"; do
             [ -f "$c" ] && realpath "$c"; done | sort -u); do
  grep -qF -- "$old" "$s" || { echo "unexpected live-boot http script: $s" >&2; exit 1; }
  python3 - "$s" "$old" "$new" <<'PY'
import sys
p, old, new = sys.argv[1:]
s = open(p).read().replace(old, new)
s = s.replace('"Trying wget ${url}', '"Trying curl ${url}')
open(p, "w").write(s)
PY
  patched=$((patched + 1))
done
[ "$patched" -gt 0 ] || { echo "live-boot http script not found in the initrd" >&2; exit 1; }
"$here/check-no-keys.sh" "$I"
( cd "$I" && find . -print0 | LC_ALL=C sort -z \
    | cpio -0 -o -H newc --reproducible --quiet | xz --check=crc32 -9 > "$out/initrd" )

cp "$work/zip/live/vmlinuz" "$out/vmlinuz"
release="$(cat "$R/etc/iotgw-live-release" 2>/dev/null || true)"
printf '{"clonezilla": "%s", "release": "%s", "overlaySha256": "%s", "sourceDateEpoch": %s}\n' \
  "$CLONEZILLA_VERSION" "$release" "$(sha256sum "$overlay" | cut -c1-64)" "$SOURCE_DATE_EPOCH" > "$out/image.json"
( cd "$out" && sha256sum vmlinuz initrd filesystem.squashfs image.json > SHA256SUMS )
echo "==> done"
cat "$out/SHA256SUMS"
