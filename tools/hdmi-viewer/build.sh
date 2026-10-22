#!/usr/bin/env bash
# Cross-compile hdmi-viewer.exe from Linux / WSL (MinGW-w64 toolchain).
# Output: dist/hdmi-viewer.exe
set -euo pipefail
cd "$(dirname "$0")"

TARGET=x86_64-pc-windows-gnu
PROFILE=${PROFILE:-release}

command -v cargo >/dev/null || { echo "cargo not found: install Rust from https://rustup.rs" >&2; exit 1; }
if ! command -v x86_64-w64-mingw32-gcc >/dev/null; then
  echo "x86_64-w64-mingw32-gcc not found. Install MinGW-w64:" >&2
  echo "  Debian/Ubuntu: sudo apt install gcc-mingw-w64-x86-64" >&2
  echo "  Fedora:        sudo dnf install mingw64-gcc" >&2
  exit 1
fi
rustup target list --installed | grep -qx "$TARGET" || rustup target add "$TARGET"

if [[ $PROFILE == release ]]; then
  cargo build --release --target "$TARGET"
else
  cargo build --target "$TARGET"
fi

mkdir -p dist
cp "target/$TARGET/$PROFILE/hdmi-viewer.exe" dist/hdmi-viewer.exe
echo "Built $(pwd)/dist/hdmi-viewer.exe ($(du -h dist/hdmi-viewer.exe | cut -f1))"
