# iotgw-ng Knowledge Base (Obsidian Wiki)

An [Obsidian](https://obsidian.md) vault that is a **distilled, cross-linked
knowledge base** for the iotgw-ng platform. Its single source layer is the
project [`backlog/`](../backlog/) directory (ADRs, docs, milestones, tasks).

Built and maintained with the [`obsidian-wiki`](https://github.com/Ar9av/obsidian-wiki)
framework — a set of AI-agent *skills* (markdown instructions, no runtime) that
distill sources into interconnected pages.

## How to use it

- **Open in Obsidian:** File → Open Vault → select this `wiki/` directory.
  Start at [`index.md`](index.md) or the project hub [`projects/iotgw-ng.md`](projects/iotgw-ng.md).
- **Ask questions (from Claude Code, anywhere in the repo):** `/wiki-query what is the device provisioning call chain?`
- **Refresh after backlog changes:** `/wiki-ingest` — append mode re-ingests only new/changed
  `backlog/` files (delta-tracked via `.manifest.json` content hashes).
- **Health check / link audit:** `/wiki-lint` · **add missing cross-links:** `/cross-linker`

## Layout

| Path | Holds |
|---|---|
| `index.md` | Master catalog of every page |
| `projects/iotgw-ng.md` | Project hub — architecture + milestone/task status |
| `concepts/` | Architecture patterns (call chain, k8s/kind, SOPS secrets, KMS keys…) |
| `entities/` | Concrete things (Netmaker, Cosmian KMS, Kestra, Supabase, kind…) |
| `references/` | Lookups (service ports, image CI/CD, migrations/webhooks…) |
| `synthesis/` | Cross-cutting analyses & epic histories |
| `skills/` | How-to procedures (deploy on kind, dev workflow…) |
| `journal/` | Time-bound snapshots |
| `_sources/` | Symlink to the repo `backlog/` — the **original source docs**, browsable in-vault. Each page ends with a clickable **Sources** list pointing here. |
| `_meta/taxonomy.md` | Controlled tag vocabulary |
| `AGENTS.md` | Owner conventions that steer every ingest |

Pages carry `sources:` frontmatter citing the exact `backlog/` file(s) each fact
came from; `^[inferred]` / `^[ambiguous]` mark synthesized vs. uncertain claims;
`> [!warning]` callouts flag where a task contradicts an ADR (the ADR wins).

## Reproducing the setup on another machine

The vault (this directory) is committed. The agent skills + bootstrap are
machine-local (gitignored) — regenerate them with:

```bash
uv tool install obsidian-wiki
obsidian-wiki setup --vault "$PWD/wiki" --project . --project-only
```

> The installer also symlinks `CLAUDE.md`/`GEMINI.md` to its own `AGENTS.md` and
> drops other-agent skill mirrors; after running it, restore the project's
> `CLAUDE.md` and `.claude/skills/skill-creator/` and remove the non-Claude dirs
> (see this repo's `.gitignore` for the exact ignore set).

## Optional: QMD semantic search

`wiki-query`/`wiki-ingest` use [QMD](https://github.com/tobi/qmd) (local, no API
key) for concept-level search when configured; otherwise they fall back to grep.
This vault is wired for QMD via two collections (all machine-local — nothing in
the repo). To set it up on another machine:

```bash
npm install -g @tobilu/qmd                                   # needs Node >= 22
qmd collection add "$PWD/wiki"    --name iotgw-wiki           # distilled pages
qmd collection add "$PWD/backlog" --name iotgw-backlog        # raw sources
qmd embed                                                    # ~330MB model auto-downloads
```

Then exclude the in-vault source copies from the wiki collection by adding an
`ignore: ["**/_sources/**", "**/_raw/**", "**/_staging/**", "**/_archives/**"]`
list under `iotgw-wiki` in `~/.config/qmd/index.yml` and run `qmd update`.
The obsidian-wiki side is enabled in `~/.obsidian-wiki/config`:
`QMD_WIKI_COLLECTION=iotgw-wiki`, `QMD_PAPERS_COLLECTION=iotgw-backlog`,
`QMD_TRANSPORT=cli`. Refresh after re-ingests with `qmd update && qmd embed`.
