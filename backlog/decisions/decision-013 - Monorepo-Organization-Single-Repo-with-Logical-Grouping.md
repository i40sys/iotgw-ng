---
id: decision-013
title: Monorepo Organization — Single Repo with Logical Grouping (finalizes decision-012)
date: '2026-06-12 21:00'
status: accepted
---

## Context

`decision-012` (status *proposed/interim*) recorded that the seven nested git
repos were collapsed into one root repo on 2026-05-29, but left the long-term
VCS topology **deliberately open** with 7 unresolved questions and 4 candidate
outcomes (A flat single repo, B submodules, C subtree, D revert to multi-repo).

This ADR **finalizes** that decision and defines the monorepo's organization —
optimized for development, with a clear path to production.

## Decision

**Adopt Outcome A: a single flat monorepo at `~/iotgw-ng`**, with a *logical*
grouping layer rather than a disruptive physical re-layout. The existing stack
directories keep their locations (their docker-compose bind mounts and
root-owned runtime volumes are path-coupled; mass-moving them would break live
state and ~30 path references in docs/agents for no functional gain). Structure
is expressed through (a) a documented taxonomy, (b) new top-level infra dirs,
and (c) a root `just` orchestrator + `README.md`.

### Logical taxonomy (the mental model)

| Group | Members | Role |
|---|---|---|
| **app** | `iotgw-ui/` | product UI + API |
| **platform** | `supabase/`, `kestra/`, `kms/` | stateful backend services |
| **edge** | `traefik-poc/` | ingress/TLS (PoC → k8s Ingress) |
| **automation** | `ansible/` | Netmaker collection |
| **infra** | `deploy/`, `secrets/`, `tools/` | how it's built, secured, shipped |
| **docs/meta** | `backlog/`, `.claude/`, `CLAUDE.md`, `README.md` | knowledge + tooling |

### What was added (non-breaking)

- `README.md` — repository map + quickstart (the workspace had none).
- `justfile` — one orchestrator for secrets, compose stacks, dev servers,
  kind/k8s, tests (`just` is already used in `ansible/netmaker`).
- `secrets/`, `tools/` (decision-014) and `deploy/` (decision-015).

## Answers to decision-012's open questions

1. **Orphaned subproject remotes** → **Abandon them as code remotes** (Outcome
   A). They remain as historical/CI mirrors only (see Q2). The monorepo is the
   single source of truth. `BACKUP/git-archives/` stays as the reversibility net.
2. **Mislocated CI (`ansible/netmaker/.github/workflows/publish-collection.yml`)**
   → **Keep Ansible Galaxy publishing out-of-band for now** (manual
   `ansible-galaxy collection publish`, documented in `ansible/netmaker`), and
   plan a root-level CI later that publishes on a path/tag filter. The in-tree
   workflow is left as reference but is known-dead in the monorepo. (Backlog
   task added.)
3. **`supabase` canonical remote** → The `i40sys/iotgw-ng_supabase` push was a
   one-off backup; the monorepo is canonical. `CLAUDE.md` "local only" wording
   is corrected (it's now part of the monorepo, not a standalone repo).
4. **Root repo remote** → **Keep local for now**, but it is *push-ready*: all
   real secrets are now SOPS-encrypted (decision-014), so the working tree is
   safe to push to a private remote. Before pushing, resolve git **history**
   (Q6 + decision-014: rotate the historical TLS/WireGuard keys or rewrite
   history). Recommended remote: a private Gitea/GitHub `iotgw-ng`.
5. **Kestra flow source carve-out** → **Accept the carve-out.** Kestra flows
   live in Postgres + `i40sys/iotgw-kestra` and are re-imported via the
   `sync-namespace-files` flow; the root-owned `kestra/data/` Docker volume
   stays gitignored. Under k8s the flows are re-imported the same way
   (decision-015), so the monorepo never needs to track that volume.
6. **Secrets already in remote/local history** → **Rotate** (decision-014
   rotation runbook). Tracked-tip secrets are removed; historical blobs are
   neutralized by rotation. A backlog task covers an optional history rewrite
   before any first push.
7. **Vendored binary & PoC certs** → `kms/contrib/cosmian` stays untracked
   (re-fetched on setup; documented in `kms/contrib/README.md`); the Traefik
   PoC leaf cert/key is regenerated and moved out of tracked compose
   (decision-014); public CA/cert copies may stay.

## Production path

The same monorepo serves dev and prod without restructure:
- **dev**: `just up-all` (compose) or `just kind-up && just k8s-deploy` (kind).
- **prod**: the `deploy/k8s/` kustomize **base** + a `prod` overlay (image
  registry, real ingress hostnames, external Postgres, prod secrets via the
  same SOPS files re-keyed to a cluster/KMS age recipient). `secrets/` is the
  one secret source for every environment.

## Consequences

**Positive**: simplest mental model; atomic cross-stack commits; one
orchestrator; no risky data-dir moves; push-ready once history is handled.

**Negative**: per-subproject independent release tagging is gone (acceptable —
only the Ansible collection released independently, handled in Q2); the "one
repo for everything" claim still has the Kestra-flow carve-out (Q5, accepted
and documented).

**Future (optional)**: if a physical re-layout into `apps/ platform/ edge/
automation/` is ever wanted, do it as a scripted `git mv` + path-reference
sweep in a dedicated change — not bundled with functional work.

## References

- `decision-012` — the consolidation this finalizes.
- `decision-014` — secrets (makes the repo push-ready).
- `decision-015` — k8s/kind (the `deploy/` tree).
- `README.md`, `justfile` — the implemented organization layer.
