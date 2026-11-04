#!/usr/bin/env bash
#
# backlog-web.sh — the `backlog` proc of the dev stack (mprocs.yaml).
#
# The backlog browser is NOT a child of mprocs: there is exactly one owner,
# scripts/backlog-serve.sh (also `just backlog`), which (re)starts it detached
# on 0.0.0.0:52175. This proc only (re)starts it and follows its log, so
# `just backlog` and `just dev` can never run two copies that fight for the port.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
"$REPO/scripts/backlog-serve.sh" up
exec tail -n +1 -F "${XDG_STATE_HOME:-$HOME/.local/state}/$(basename "$REPO")/backlog-web.log"
