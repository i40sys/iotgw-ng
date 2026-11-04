#!/usr/bin/env bash
#
# backlog-run.sh — ONE run of the backlog browser (socat + backlog). Started
# detached and kept alive (OOM restart loop) by scripts/backlog-serve.sh.
#
# `backlog browser` always binds 127.0.0.1 (no --host flag), so it is not
# reachable from other hosts / hostnames. We run it on an INTERNAL loopback
# port and expose it on 0.0.0.0 with socat. backlog does no Host-header check,
# so any hostname (localhost, wsl.ymbihq.local, an IP, ...) works.
#
#   0.0.0.0:52175  (public, socat)  ->  127.0.0.1:52177  (backlog browser)
#
# Ports MUST match scripts/dev-session.sh (BACKLOG_PORT / BACKLOG_INT_PORT).
set -euo pipefail

PUBLIC_PORT="${BACKLOG_PORT:-52175}"
INTERNAL_PORT="${BACKLOG_INT_PORT:-52177}"

SOCAT="$(command -v socat || true)"
[ -n "$SOCAT" ] || SOCAT="$HOME/bin/socat"
[ -x "$SOCAT" ] || { echo "backlog-web: socat not found" >&2; exit 1; }

"$SOCAT" "TCP-LISTEN:${PUBLIC_PORT},bind=0.0.0.0,fork,reuseaddr" "TCP:127.0.0.1:${INTERNAL_PORT}" &
SOCAT_PID=$!
trap 'kill "$SOCAT_PID" 2>/dev/null || true' EXIT INT TERM

printf '\n  Backlog: http://wsl.ymbihq.local:%s  (Windows)  ·  http://localhost:%s  (WSL)\n\n' "$PUBLIC_PORT" "$PUBLIC_PORT"

# capped at 1G RAM / no swap (backlog browser heap leak); OOM kill -> backlog-serve.sh loop restarts it.
# Its own banner shows the INTERNAL loopback port, not the URL to open: hide it.
systemd-run --user --scope -q -p MemoryMax=1G -p MemorySwapMax=0 \
  backlog browser --no-open -p "$INTERNAL_PORT" 2>&1 |
  grep --line-buffered -vE '127\.0\.0\.1:|Press Ctrl\+C|navigate to the URL above'
