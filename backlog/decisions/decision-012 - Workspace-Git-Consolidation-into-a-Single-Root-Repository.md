---
id: decision-012
title: Workspace Git Consolidation into a Single Root Repository
date: '2026-06-08 04:26'
status: superseded
---

> **⚠️ This is an OPEN / INTERIM decision record, not a finalized ADR.**
> It documents a git-consolidation that was *executed* on 2026-05-29 and
> captures the unresolved trade-offs that must still be settled before a
> **final** decision is taken on the workspace's long-term VCS topology.
> The "Open Questions" section is the part that still needs a human call.

> **Note (superseded):** This interim decision has since been **FINALIZED by
> decision-013** (monorepo organization, Outcome A) — all 7 open questions are
> answered there. Secrets handling is covered by decision-014 (SOPS+age) and the
> Kubernetes migration by decision-015. The content below is retained for history.

## Context

`~/iotgw-ng` is a multi-project workspace. Before consolidation it was a
loose collection of **independent git repositories** nested inside one
directory tree, with no repo at the workspace root:

| Path | Remote (pre-consolidation) | Notes |
|---|---|---|
| `iotgw-ui` | `git@github.com:i40sys/iotgw-ui.git` | main app; tags v0.10.0–v0.11.1 |
| `kms` | `https://github.com/i40sys/iotgw-kms.git` | tags v0.1.0/v0.2.0; pre-commit hooks |
| `supabase` | **none (local-only)** | 15 commits existed nowhere else |
| `supabase/volumes/functions` | `git@github.com:i40sys/iotgw-ng_edge-functions.git` | edge functions |
| `ansible/netmaker` | `git@github.com:oriolrius/netmaker-ansible-automation.git` | has a GitHub Actions workflow; 1 stash; tags v1.0.x |
| `kestra/kestra-ansible-reporter` | `ssh://git.oriolrius.cat:222/oriolrius/kestra-ansible-reporter.git` | small python project |
| `kestra/data/main/iotgw-ng/_files` | `https://github.com/i40sys/iotgw-kestra.git` | **root-owned** (Docker volume); 6 unpushed commits; tracks real private SSH keys |

**Motivation (user request):** drive every subproject from one place —
remove all nested `.git` folders and create a single git repo at
`~/iotgw-ng` for everything, excluding postgres/runtime data, `BACKUP/`,
and other non-source material.

This change is **hard to reverse** (it deletes the `.git` metadata of
seven repositories, several with live remotes), so a full inventory and a
safety net were produced before any deletion.

## What Was Done (executed 2026-05-29)

1. **Read-only inventory** of all 7 nested repos (remotes, unpushed
   commits, stashes, tags, CI configs, hooks, tracked secrets, ownership).
2. **Full safety archive** — every `.git` directory was tar-gzipped to
   `BACKUP/git-archives/<repo>.git.tar.gz` (the root-owned `_files` one via
   `sudo`). These archives contain complete history, tags, stashes and
   unpushed commits and make the operation reversible. `BACKUP/` is
   gitignored.
3. **Published the two histories that lived nowhere else**, after
   re-authenticating the `i40sys` GitHub account:
   - `_files` → pushed 6 commits to `i40sys/iotgw-kestra` (verified local
     == remote `2c21b46`).
   - `supabase` → pushed its 15 commits to a **new private repo**
     `i40sys/iotgw-ng_supabase`.
4. **Deleted all 7 nested `.git` directories** (the root-owned
   `_files/.git` required `sudo`).
5. **Created a single root repo** at `~/iotgw-ng` (branch `main`) and
   folded all working trees in. Two commits:
   - `9d325f5` — initial orchestration layer (`.claude/`, `CLAUDE.md`,
     `backlog/`).
   - `e56d1f5` — collapse of the subprojects (510 tracked files total).
6. **Exclusions** (root `.gitignore`; each subproject keeps its own
   `.gitignore` too):
   - Kestra Docker volume `/kestra/data/` (root-owned; flow source remains
     at `i40sys/iotgw-kestra`), `/kestra/db/`, `/kestra/logs/`.
   - Supabase postgres/storage/logs volumes.
   - `node_modules`, `dist`, `.venv`, `__pycache__`, `*.deb`, `**/.engram`.
   - Secrets: `.env`, `*.pem`, `*.p12`, `*.key`, `id_rsa` (files kept on
     disk, untracked).
   - Vendored 35 MB binary `kms/contrib/cosmian`.
7. **Secret remediation** caught by a pre-commit scan:
   - `traefik-poc/server.key` (a real TLS private key committed in the
     initial commit) was `git rm --cached`'d.
   - `_files` private keys were never tracked (gitignored).

**Current state:** one local repo, 510 files, clean tree, no remote.
All prior subproject remotes are untouched on their servers.

> **Update (2026-06-17):** a canonical remote now exists — the private Gitea
> repo `oriolrius/iotgw-ng` (`ssh://git@git.oriolrius.cat:222/oriolrius/iotgw-ng.git`,
> default branch `main`). All branches were pushed; this resolves open
> question 4 below in favour of "push it to private Gitea". `BACKUP/git-archives/`
> remains the reversibility net.

## Decision (interim)

Adopt — **provisionally** — a single flat root repository at `~/iotgw-ng`
that tracks all subproject *source* while excluding runtime/volume/secret
material. This is the working arrangement **right now**, but the final VCS
topology is **deliberately left open** pending resolution of the items
below. No irreversible cleanup (e.g. deleting `BACKUP/git-archives/`,
deleting the standalone GitHub repos) should happen until this decision is
finalized.

## Open Questions — to resolve before this becomes final

These are the "worth flagging" items. Each needs an explicit call.

1. **Orphaned subproject remotes.** The root repo has no link to the
   per-subproject remotes (`i40sys/iotgw-ui`, `iotgw-kms`,
   `iotgw-ng_edge-functions`, the Gitea reporter, `netmaker-ansible-automation`).
   Pushing to any of them now requires restoring the relevant
   `BACKUP/git-archives/*.git.tar.gz` or a fresh clone.
   *Decide:* fully abandon those remotes (single-repo wins), or keep them
   alive via **git submodules** / **git subtree** / a mirror-push process?

2. **Mislocated CI workflow.** `ansible/netmaker/.github/workflows/publish-collection.yml`
   only triggers when it sits at a repo root's `.github/workflows/`. In the
   collapsed repo it is dead config (the standalone GitHub repo still runs
   it). The netmaker collection is also published to Ansible Galaxy via this
   pipeline.
   *Decide:* relocate/rewire it to the root `.github/workflows/`, keep
   publishing from the standalone repo, or drop the automated publish?

3. **`supabase` is no longer "local only".** Its 15 commits now live in the
   **new private** `i40sys/iotgw-ng_supabase`. The root `CLAUDE.md`
   "Subprojects" table still lists `supabase/` as "local only".
   *Decide:* keep `iotgw-ng_supabase` as the canonical supabase remote (and
   update `CLAUDE.md`/`doc-010`), or treat that push as a one-off backup and
   delete it?

4. **Root repo has no remote.** The consolidated repo is local-only.
   *Decide:* push it somewhere (GitHub `i40sys/iotgw-ng`? private Gitea?) or
   intentionally keep it local.
   **Resolved (2026-06-17):** pushed to private Gitea `oriolrius/iotgw-ng`
   (see the "Current state" update above).

5. **Kestra flow source is outside the root repo.** `kestra/data/.../_files`
   is a root-owned Docker volume and was excluded; its source lives only at
   `i40sys/iotgw-kestra` + the BACKUP archive. So "one repo for everything"
   is not literally true for the Kestra flows.
   *Decide:* accept the carve-out, or relocate the flows out of the volume
   (e.g. `kestra/flows/`) so they can be tracked by the root repo.

6. **Secrets already in remote history.** `i40sys/iotgw-kestra` already
   contains committed private SSH keys (`keys/id_rsa`,
   `files/credentials/id_rsa`) and a `.env`. Consolidation did not worsen
   this, but it is a pre-existing exposure.
   *Decide:* scrub-and-rotate those keys, or accept (private repo)?

7. **Vendored binary & certs.** `kms/contrib/cosmian` (35 MB) was untracked;
   `traefik-poc/server.crt`/`ca.crt` (public certs) are tracked while
   `server.key` was removed.
   *Decide:* is excluding the binary acceptable (re-fetch on setup), and
   should the PoC certs be regenerated/ignored entirely?

## Consequences

**Positive**
- One `git` working context for the whole workspace; no per-subproject
  `cd` + `.git` juggling.
- Atomic cross-project commits are now possible.
- Fully reversible today via `BACKUP/git-archives/` (do not delete until
  finalized).
- A pre-commit secret scan removed at least one real leaked key
  (`traefik-poc/server.key`) from tracking.

**Negative / risk**
- Loss of per-subproject commit history in the *local* tree (history is
  preserved on remotes + archives, not in the root repo's log).
- Independent release tagging per subproject is gone (tags live on remotes
  only).
- CI/publish pipelines tied to standalone repos are now dead in-tree
  (item 2).
- "Single repo for everything" has a real exception (Kestra flows, item 5).
- Divergence risk: edits in the root repo do not propagate to the old
  remotes unless a sync mechanism is chosen (item 1).

## Candidate Final Outcomes (for the eventual decision)

- **A. Commit to the flat single repo.** Decouple from all old remotes,
  give the root repo its own remote, rewire/abandon CI, accept the Kestra
  carve-out. Simplest mental model; loses modular release flows.
- **B. Single repo + submodules.** Root repo references subprojects as
  submodules pinned to their existing remotes. Keeps independent history &
  CI; reintroduces submodule friction (and cannot cover the root-owned
  Kestra volume).
- **C. Single repo + git subtree.** Subprojects vendored via `git subtree`
  with periodic push/pull to their remotes. No submodule UX cost; more
  complex sync.
- **D. Revert to multi-repo.** Restore from `BACKUP/git-archives/`; keep the
  workspace as independent repos. Fallback if the single-repo model proves
  worse in practice.

## Reversibility

To restore any subproject's independent repo:
`tar xzf BACKUP/git-archives/<name>.git.tar.gz -C <subproject_path>`
(re-creates its `.git`; the working tree already matches). The standalone
GitHub/Gitea remotes were never deleted.

## References

- Root `CLAUDE.md` — "Subprojects" table (needs the supabase update, item 3).
- `i40sys/iotgw-kestra` — canonical Kestra flow source (item 5/6).
- `i40sys/iotgw-ng_supabase` — new supabase remote (item 3).
- `BACKUP/git-archives/` — complete `.git` archives of all 7 former repos.
- Commits `9d325f5`, `e56d1f5` in the root repo.
