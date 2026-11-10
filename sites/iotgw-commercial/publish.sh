#!/usr/bin/env bash
# Publish the website to https://iotgw.industry40.systems
#
#   1. build dist/ (fails on a missing translation)
#   2. sync dist/ into site/ of the stack repo git.oriolrius.cat/oriolrius/k5-stack-iotgw-web
#   3. commit + push the stack repo
#   4. deploy the Dockhand git stack `iotgw-web` (env k5); skip with --no-deploy
#
# Needs: SSH access to git.oriolrius.cat, and for step 4 the Bitwarden item "dockhand admin"
# (through the bitwarden skill helper). No secret is written to disk outside a 0600 temp dir.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
STACK_REPO="ssh://git@git.oriolrius.cat:222/oriolrius/k5-stack-iotgw-web.git"
DOCKHAND="https://dh.joor.net"
STACK_NAME="iotgw-web"
BW="${BW_EXEC:-$HOME/.claude/skills/bitwarden/scripts/bw_exec.sh}"
DEPLOY=1
[ "${1:-}" = "--no-deploy" ] && DEPLOY=0

cd "$HERE"
uv run python build.py

WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

git clone -q "$STACK_REPO" "$WORK/stack"
rsync -a --delete "$HERE/dist/" "$WORK/stack/site/"
chmod -R a+rX "$WORK/stack/site"

SRC_REV="$(git -C "$HERE" rev-parse --short HEAD)"
cd "$WORK/stack"
if [ -z "$(git status --porcelain)" ]; then
  echo "site/ already matches dist/ — nothing to commit."
else
  git add -A site
  git commit -q -m "feat(site): publish iotgw-ng@${SRC_REV}"
  git push -q origin main
  echo "pushed $(git rev-parse --short HEAD) to k5-stack-iotgw-web"
fi

[ "$DEPLOY" = 1 ] || { echo "deploy skipped (--no-deploy)"; exit 0; }

JAR="$WORK/dh.cookies"
PASS="$(bash "$BW" get password "dockhand admin")"
curl -fsS -c "$JAR" -H 'content-type: application/json' \
  -d "$(jq -nc --arg p "$PASS" '{username:"admin",password:$p}')" "$DOCKHAND/api/auth/login" >/dev/null
unset PASS
SID="$(curl -fsS -b "$JAR" "$DOCKHAND/api/git/stacks" | jq -r --arg n "$STACK_NAME" '.[] | select(.stackName==$n and .environmentId==3) | .id')"
[ -n "$SID" ] || { echo "Dockhand git stack $STACK_NAME not found" >&2; exit 1; }
curl -fsS -b "$JAR" -X POST "$DOCKHAND/api/git/stacks/$SID/deploy" >/dev/null
echo "deploy started (Dockhand stack $SID). Check: curl -fsS https://iotgw.industry40.systems/healthz"
