#!/usr/bin/env bash
#
# backlog-serve.sh — run ONLY this repo's backlog browser, detached, on the
# project's fixed ports (`just backlog`). Every call restarts it: older
# instances of THIS repo are stopped first; other projects are never touched.
#
#   0.0.0.0:52175  (public, socat)  ->  127.0.0.1:52177  (backlog browser)
#
# This script is the ONLY owner of the backlog browser: `just backlog` and the
# `just dev` mprocs proc (scripts/backlog-web.sh, a log viewer) both call `up`.
# The browser runs detached (own session), in a restart loop (1G OOM cap) over
# scripts/backlog-run.sh. "Ours" = working directory is this repo (or below) AND
# the command is a backlog browser / our socat / our runner — the same rule as
# the other projects' launchers. Other projects' instances are never touched.
#
#   scripts/backlog-serve.sh [up|stop|status]
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
BACKLOG_PORT="${BACKLOG_PORT:-52175}"         # MUST match scripts/dev-session.sh / mprocs.yaml
BACKLOG_INT_PORT="${BACKLOG_INT_PORT:-52177}" # (env overrides: tests only)
export BACKLOG_PORT BACKLOG_INT_PORT          # read by scripts/backlog-web.sh
PORTS=("$BACKLOG_PORT" "$BACKLOG_INT_PORT")
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/$(basename "$REPO")"
LOG="$STATE/backlog-web.log"
PGID_FILE="$STATE/backlog-web-${BACKLOG_PORT}.pgid"
CMD="${1:-up}"
mkdir -p "$STATE"
exec 9>"$STATE/backlog-serve.lock"
flock -w 60 9 || { echo "another backlog-serve.sh is busy" >&2; exit 1; }

port_pid() { ss -ltnp 2>/dev/null | grep -E "[:.]$1[[:space:]]" | grep -oP 'pid=\K[0-9]+' | head -1 || true; }
port_listening() { ss -ltn 2>/dev/null | grep -qE "[:.]$1[[:space:]]"; }
pid_cwd() { readlink -f "/proc/$1/cwd" 2>/dev/null || true; }
pid_cmd_full() { tr '\0' ' ' <"/proc/$1/cmdline" 2>/dev/null || true; }
pid_cmd() { pid_cmd_full "$1" | cut -c1-100; }
pid_pgid() { ps -o pgid= -p "$1" 2>/dev/null | tr -d ' '; }
is_ours() { local c; c="$(pid_cwd "$1")"; [[ "$c" == "$REPO" || "$c" == "$REPO"/* ]]; }
# Our backlog processes: (a) whatever of this repo holds our ports, (b) any
# process of this repo that IS a backlog browser on our internal port, our socat
# or our runner (covers an instance still starting, and the old mprocs-child
# layout), (c) the group this script started last (pidfile; trusted only while
# its leader still runs from this repo — a recycled pgid is ignored).
is_our_server() {
  local a; a="$(pid_cmd_full "$1")"
  [[ "$a" =~ (^|[/ ])backlog\ (browser|serve)\ .*-(p|-port)\ $BACKLOG_INT_PORT( |$) ]] ||
    [[ "$a" =~ (^|/)socat\ TCP4?-LISTEN:$BACKLOG_PORT, ]] ||
    [[ "$a" =~ scripts/backlog-run\.sh ]]
}
our_pids() {
  {
    local p pid pgid
    for p in "${PORTS[@]}"; do
      pid="$(port_pid "$p")"
      if [ -n "$pid" ] && is_ours "$pid"; then echo "$pid"; fi
    done
    for pid in $(pgrep -f 'backlog (browser|serve)|socat|backlog-run\.sh' || true); do
      [ "$pid" = "$$" ] && continue
      if is_ours "$pid" && is_our_server "$pid"; then echo "$pid"; fi
    done
    pgid="$(cat "$PGID_FILE" 2>/dev/null || true)"
    if [[ "$pgid" =~ ^[0-9]+$ ]] && [ -d "/proc/$pgid" ] && is_ours "$pgid"; then
      pgrep -g "$pgid" || true
    fi
  } | sort -un
}

foreign_ports() {
  local p pid
  for p in "${PORTS[@]}"; do
    pid="$(port_pid "$p")"
    if [ -z "$pid" ]; then
      if port_listening "$p"; then echo "port $p: held by another user"; fi
    elif ! is_ours "$pid"; then
      echo "port $p: pid $pid ($(pid_cmd "$pid")) cwd=$(pid_cwd "$pid")"
    fi
  done
  return 0
}

STOPPED=0 # set by stop_ours: how many old instances it stopped (0 or 1+)
stop_ours() {
  local pid pgid self_pgid targets=()
  self_pgid="$(pid_pgid $$)"
  for pid in $(our_pids); do
    pgid="$(pid_pgid "$pid")"
    # Kill the whole group (socat + backlog + runner loop) when its leader is
    # ours too; never our own group (the mprocs viewer calls us).
    if [ -n "$pgid" ] && [ "$pgid" != "$self_pgid" ] && [ -d "/proc/$pgid" ] && is_ours "$pgid"; then
      targets+=("-$pgid")
    else
      targets+=("$pid")
    fi
  done
  rm -f "$PGID_FILE"
  ((${#targets[@]})) || return 0
  STOPPED=1
  mapfile -t targets < <(printf '%s\n' "${targets[@]}" | sort -u)
  kill -TERM -- "${targets[@]}" 2>/dev/null || true
  for _ in $(seq 1 20); do [ -z "$(our_pids)" ] && return 0; sleep 0.25; done
  kill -KILL -- "${targets[@]}" 2>/dev/null || true
  for _ in $(seq 1 8); do [ -z "$(our_pids)" ] && return 0; sleep 0.25; done
  echo "warning: old backlog processes still running: $(our_pids | tr '\n' ' ')" >&2
}

LOG_SHOWN="${LOG/#$HOME/\~}"
banner() { # $1 = headline
  local b=$'\e[1m' g=$'\e[32m' d=$'\e[2m' r=$'\e[0m'
  [ -t 1 ] || { b=; g=; d=; r=; }
  echo
  echo "  ${g}●${r} ${b}$1${r}"
  echo
  echo "    Windows / browser:  ${b}http://wsl.ymbihq.local:$BACKLOG_PORT${r}"
  echo "    WSL:                http://localhost:$BACKLOG_PORT"
  echo
  echo "    ${d}stop: just backlog stop  ·  log: $LOG_SHOWN${r}"
  echo
}

case "$CMD" in
status)
  if [ -n "$(our_pids)" ]; then
    banner "Backlog ($(basename "$REPO")) is running"
  else
    echo "Backlog ($(basename "$REPO")) is not running. Start it: just backlog"
  fi
  foreign_ports | sed 's/^/  warning: another project uses /'
  ;;

stop)
  stop_ours
  if ((STOPPED)); then echo "Backlog ($(basename "$REPO")) stopped."; else echo "Backlog ($(basename "$REPO")) was not running."; fi
  ;;

up)
  foreign="$(foreign_ports)"
  if [ -n "$foreign" ]; then
    echo "Cannot start backlog: another project uses its port:" >&2
    printf '  %s\n' "${foreign//$'\n'/$'\n'  }" >&2
    exit 1
  fi
  stop_ours
  cd "$REPO"
  # Own session/process group: `stop` kills loop + socat + backlog together.
  # The loop restarts backlog after an OOM kill (1G cap in backlog-run.sh).
  setsid nohup bash -c 'while :; do scripts/backlog-run.sh; echo "[backlog exited $?; restart in 2 s]"; sleep 2; done' \
    >"$LOG" 2>&1 </dev/null 9>&- &
  echo "$!" >"$PGID_FILE" # setsid: the new process is its group's leader
  for _ in $(seq 1 60); do
    # Probe backlog first: probing socat before backlog listens logs socat errors.
    if curl -fsS -o /dev/null "http://127.0.0.1:$BACKLOG_INT_PORT/" 2>/dev/null &&
      curl -fsS -o /dev/null "http://127.0.0.1:$BACKLOG_PORT/" 2>/dev/null; then
      ss -ltn | grep -qE "0\.0\.0\.0:${BACKLOG_PORT}[[:space:]]" ||
        echo "warning: port $BACKLOG_PORT is not on 0.0.0.0 — Windows cannot reach it" >&2
      if ((STOPPED)); then banner "Backlog ($(basename "$REPO")) restarted"; else banner "Backlog ($(basename "$REPO")) started"; fi
      exit 0
    fi
    sleep 0.5
  done
  echo "Backlog did not start in 30 s. Last log lines ($LOG_SHOWN):" >&2
  tail -20 "$LOG" >&2
  exit 1
  ;;

*)
  echo "usage: $(basename "$0") [up|stop|status]" >&2
  exit 2
  ;;
esac
