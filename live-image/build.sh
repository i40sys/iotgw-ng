#!/usr/bin/env bash
# Build the iotgw live-image overlay (decision-031): test, compile the two
# static Go binaries (no Go toolchain goes into the image) and assemble a
# root-owned overlay tarball for scripts/live-image/rebuild.sh --sync-from.
#
# Usage: live-image/build.sh            -> live-image/dist/iotgw-live-overlay.tar.gz
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

VERSION="$(git describe --tags --always 2>/dev/null || echo dev)"
# "dirty" means the live-image sources differ from the commit — not unrelated
# files elsewhere in the monorepo.
git diff --quiet HEAD -- . 2>/dev/null || VERSION="$VERSION-dirty"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
PKG=github.com/i40sys/iotgw-ng/live-image/internal/version
LDFLAGS="-s -w -X $PKG.Version=$VERSION -X $PKG.Commit=$COMMIT -X $PKG.BuildDate=$DATE"

echo "==> go vet + test"
go vet ./...
go test ./...

OUT=dist
STAGE="$OUT/overlay"
rm -rf "$OUT"; mkdir -p "$STAGE/usr/local/bin" "$STAGE/etc"
for cmd in iotgw-status iotgw-bootstrap; do
  echo "==> building $cmd ($VERSION)"
  CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "$LDFLAGS" \
    -o "$STAGE/usr/local/bin/$cmd" "./cmd/$cmd"
done
cp -a overlay/. "$STAGE/"
echo "iotgw-live $VERSION ($COMMIT, built $DATE)" > "$STAGE/etc/iotgw-live-release"
cp remove.list "$OUT/remove.list"

# Everything in the overlay is root-owned in the image.
# go-w: never let the overlay loosen /etc, /usr… permissions in the image.
tar --owner=0 --group=0 --numeric-owner --mode=go-w -C "$STAGE" -czf "$OUT/iotgw-live-overlay.tar.gz" .
echo "==> $OUT/iotgw-live-overlay.tar.gz  ($(du -h "$OUT/iotgw-live-overlay.tar.gz" | cut -f1))"
cat "$STAGE/etc/iotgw-live-release"
