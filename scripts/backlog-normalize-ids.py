#!/usr/bin/env python3
"""Normalise backlog decision/doc filenames and titles to an ID-first convention.

Target convention:
    filename   <kind>-<NNN>-<slug-of-title>.md      e.g. decision-001-frontend-technology-stack-react-19-and-tanstack-ecosystem.md
    title       NNN: <Original Title>               e.g. 001: Frontend Technology Stack - React 19 and TanStack Ecosystem
    H1          # NNN: <Original Title>             only when an H1 already mirrored the title

The frontmatter `title` is treated as the source of truth for the slug, because
that is the field the Backlog.md CLI displays. Three files had a filename that
disagreed with their title (decision-010, decision-011, doc-016); the title wins
and the rename is reported.

Cross-references are rewritten repo-wide in raw, space-as-%20 and fully
percent-encoded forms, because markdown links to these files appear in all three
shapes.

Usage:  scripts/backlog-normalize-ids.py --dry-run | --apply
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import unicodedata
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {
    ".git", "node_modules", "BACKUP", "dist", ".venv", ".codegraph",
    ".obsidian", ".pnpm-store", "playwright-report", "test-results",
}
# kestra/data is a gitignored write-through artefact of the running instance.
SKIP_PREFIXES = ("kestra/data",)
TEXT_SUFFIXES = {".md", ".yml", ".yaml", ".ts", ".tsx", ".js", ".sh", ".json", ".sql", ".toml", ".txt"}


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower().replace("'", "").replace("’", "")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return re.sub(r"-{2,}", "-", text).strip("-")


def read_frontmatter_title(body: str) -> tuple[str | None, str | None]:
    """Return (title, raw_title_block). Handles plain, quoted and folded scalars."""
    m = re.search(r"^title:[ \t]*(>-|>|\|-|\|)\s*\n((?:[ \t]+.*\n)+)", body, re.M)
    if m:
        folded = " ".join(line.strip() for line in m.group(2).strip().splitlines())
        return folded, m.group(0)
    m = re.search(r"^title:[ \t]*(.+)$", body, re.M)
    if m:
        return m.group(1).strip().strip("\"'"), m.group(0)
    return None, None


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    renames: list[tuple[Path, Path]] = []
    edits: list[tuple[Path, str]] = []
    notes: list[str] = []

    for kind, folder in (("decision", "backlog/decisions"), ("doc", "backlog/docs")):
        d = ROOT / folder
        for path in sorted(d.glob("*.md")):
            body = path.read_text(encoding="utf-8")
            idm = re.search(r"^id:\s*(\S+)", body, re.M)
            if not idm:
                notes.append(f"SKIPPED (no id in frontmatter): {path.relative_to(ROOT)}")
                continue
            num = idm.group(1).split("-")[-1]
            title, raw_block = read_frontmatter_title(body)
            if not title:
                notes.append(f"SKIPPED (no title): {path.relative_to(ROOT)}")
                continue

            # Idempotent: strip an ID prefix we may have added on a previous run.
            bare = re.sub(rf"^{num}:\s*", "", title)
            new_title = f"{num}: {bare}"
            new_name = f"{kind}-{num}-{slugify(bare)}.md"

            if slugify(bare) not in slugify(path.stem):
                notes.append(
                    f"filename/title disagreed, title wins: {path.name} -> {new_name}"
                )

            new_body = body
            if raw_block is not None:
                new_body = new_body.replace(raw_block, f'title: "{new_title}"\n'
                                            if raw_block.endswith("\n") else f'title: "{new_title}"', 1)
            # Prefix the H1 only when it mirrored the title, so bodies whose first
            # heading is something else (## Context) are left alone.
            h1 = re.search(r"^#\s+(.+)$", new_body, re.M)
            if h1 and slugify(h1.group(1)) == slugify(bare):
                new_body = new_body.replace(h1.group(0), f"# {new_title}", 1)

            if new_body != body:
                edits.append((path, new_body))
            if path.name != new_name:
                renames.append((path, path.with_name(new_name)))

    # --- reference rewrite map (raw + both encodings) ------------------------
    ref_map: dict[str, str] = {}
    for old, new in renames:
        for form in (old.name, old.name.replace(" ", "%20"), urllib.parse.quote(old.name)):
            ref_map[form] = (
                new.name if form == old.name
                else new.name.replace(" ", "%20") if form == old.name.replace(" ", "%20")
                else urllib.parse.quote(new.name)
            )

    # A file can be BOTH title-edited and reference-rewritten (a doc that links
    # to another doc). Seed the walk from the already-title-edited content, or
    # the second write silently reverts the first.
    pending: dict[Path, str] = {p: b for p, b in edits}

    ref_edits: list[tuple[Path, str]] = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [x for x in dirnames if x not in SKIP_DIRS]
        rel_dir = os.path.relpath(dirpath, ROOT)
        if rel_dir.startswith(SKIP_PREFIXES):
            dirnames[:] = []
            continue
        for fn in filenames:
            p = Path(dirpath) / fn
            if p.suffix not in TEXT_SUFFIXES:
                continue
            try:
                txt = pending.get(p) or p.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            out = txt
            for old_form, new_form in ref_map.items():
                if old_form in out:
                    out = out.replace(old_form, new_form)
            if out != txt:
                ref_edits.append((p, out))

    # --- report --------------------------------------------------------------
    print(f"renames      : {len(renames)}")
    print(f"title edits  : {len(edits)}")
    print(f"files w/ refs: {len(ref_edits)}")
    for n in notes:
        print(f"  NOTE {n}")
    if args.dry_run:
        for old, new in renames:
            print(f"  {old.name}\n    -> {new.name}")
        for p, _ in ref_edits:
            print(f"  refs: {p.relative_to(ROOT)}")
        return 0

    # --- apply ---------------------------------------------------------------
    written = {p for p, _ in ref_edits}
    for path, new_body in edits:
        if path not in written:          # otherwise the ref pass writes the union
            path.write_text(new_body, encoding="utf-8")
    for p, out in ref_edits:
        p.write_text(out, encoding="utf-8")
    for old, new in renames:
        tracked = subprocess.run(
            ["git", "ls-files", "--error-unmatch", str(old.relative_to(ROOT))],
            cwd=ROOT, capture_output=True,
        ).returncode == 0
        if tracked:
            subprocess.run(["git", "mv", str(old.relative_to(ROOT)), str(new.relative_to(ROOT))],
                           cwd=ROOT, check=True)
        else:
            old.rename(new)
    print("applied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
