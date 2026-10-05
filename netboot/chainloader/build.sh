#!/usr/bin/env bash
# Build the chainloader from pinned iPXE source (task-149.03). Runs inside a
# Debian container (`just build` / CI):
#   build.sh <out-dir> [release|test <test-ca.pem> <menu-url>]
# Outputs ipxe.efi / undionly.kpxe / ipxe-usb.img (chain.ipxe) and
# ipxe-local.efi (local.ipxe: boot the local disk on UEFI).
# release: embeds chain.ipxe as-is and trusts ONLY certs/isrg-root-*.pem.
# test:    same script with the menu URL replaced, trusting ONLY the test CA.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$1"; mode="${2:-release}"
mkdir -p "$out"; out="$(realpath "$out")"
# shellcheck source=IPXE_VERSION
. "$here/IPXE_VERSION"
src="${IPXE_SRC:-/tmp/ipxe}"
if [ ! -d "$src/.git" ]; then
  git clone -q --depth 1 --branch "$IPXE_TAG" https://github.com/ipxe/ipxe.git "$src"
fi
[ "$(git -C "$src" rev-parse HEAD)" = "$IPXE_COMMIT" ] \
  || { echo "iPXE $IPXE_TAG is not the pinned commit $IPXE_COMMIT" >&2; exit 1; }
git -C "$src" clean -qfdx
cp "$here"/config/local/*.h "$src/src/config/local/"

# Fixed name: iPXE records the EMBED file name in the binary (reproducibility).
embeddir="$(mktemp -d)"; embed="$embeddir/chain.ipxe"; cp "$here/chain.ipxe" "$embed"
case "$mode" in
  release) trust="$(ls "$here"/certs/*.pem | paste -sd,)" ;;
  test)    trust="$(realpath "$3")"
           sed -i "s#^set menu-url .*#set menu-url $4#" "$embed" ;;
  *) echo "mode must be release|test" >&2; exit 2 ;;
esac

cd "$src/src"
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}"
# TRUST= pins the root fingerprints; CERT= embeds the root certificates too,
# since servers do not send the root (iPXE would otherwise try ca.ipxe.org).
make -s -j"$(nproc)" EMBED="$embed" TRUST="$trust" CERT="$trust" \
  bin-x86_64-efi/ipxe.efi bin/undionly.kpxe bin/ipxe.lkrn >/dev/null
./util/genfsimg -o "$out/ipxe-usb.img" bin-x86_64-efi/ipxe.efi bin/ipxe.lkrn
cp bin-x86_64-efi/ipxe.efi bin/undionly.kpxe "$out/"
cp "$embed" "$out/embedded.ipxe"
# ipxe-local.efi: same iPXE, embedding only local.ipxe (boot the local disk;
# chained by the OVH menu's "Boot from local disk" on UEFI).
cp "$here/local.ipxe" "$embeddir/local.ipxe"
make -s -j"$(nproc)" EMBED="$embeddir/local.ipxe" TRUST="$trust" CERT="$trust" \
  bin-x86_64-efi/ipxe.efi >/dev/null
cp bin-x86_64-efi/ipxe.efi "$out/ipxe-local.efi"
( cd "$out" && sha256sum ipxe.efi undionly.kpxe ipxe-usb.img ipxe-local.efi > SHA256SUMS )
echo "built ($mode) -> $out"; cat "$out/SHA256SUMS"
