#!/usr/bin/env bash
# Mirror the backlog/ source documents into the Obsidian vault at wiki/_sources/
# as REAL files, so Obsidian shows them (it does not follow symlinks).
#
# wiki/_sources/ is gitignored (it duplicates backlog/, which is in this repo).
# Re-run this after editing backlog/ to refresh the in-vault copies. Run from
# the repo root or anywhere — paths are resolved relative to this script.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$repo_root/backlog"
dst="$repo_root/wiki/_sources"

[ -d "$src" ] || { echo "error: $src not found" >&2; exit 1; }
mkdir -p "$dst"

# Mirror only .md files, preserving the backlog/ subdir layout
# (decisions/ docs/ tasks/ completed/ archive/...). --delete keeps the mirror
# clean when backlog files are renamed/removed. -m prunes empty dirs.
rsync -am --delete \
  --include='*/' --include='*.md' --exclude='*' \
  "$src/" "$dst/"

count="$(find "$dst" -name '*.md' | wc -l | tr -d ' ')"
echo "synced $count backlog .md files -> wiki/_sources/"
