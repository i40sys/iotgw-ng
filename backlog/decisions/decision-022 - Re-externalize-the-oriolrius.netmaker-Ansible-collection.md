---
id: decision-022
title: Re-externalize the oriolrius.netmaker Ansible collection out of the monorepo
date: '2026-06-25 14:30'
status: accepted
---
## Context

The `decision-012` consolidation pulled seven former repos into this monorepo,
including the standalone repo `github.com/oriolrius/netmaker-ansible-automation`
which became `ansible/netmaker/`. That same ADR flagged two related problems it
could not resolve at the time (`decision-012` open questions 1 & 2, answered in
`decision-013`):

- **Orphaned remote.** `netmaker-ansible-automation` was abandoned as a code
  remote; the monorepo became the single source of truth.
- **Mislocated CI.** `ansible/netmaker/.github/workflows/publish-collection.yml`
  only fires from a repo-root `.github/workflows/`. Inside the monorepo it is
  dead config, so publishing the `oriolrius.netmaker` collection to Ansible
  Galaxy went **manual** (`decision-013` answer 2 deferred a root-level CI to a
  later task — never built).

Three facts make a different resolution clearly better than "build monorepo CI
for the collection":

1. The standalone repo **still exists, is public, and its Galaxy-publish CI
   still works** — its "Publish to Ansible Galaxy" workflow last ran green on
   2025-10-21 (and the two prior push runs), proving both the workflow and its
   `ANSIBLE_GALAXY_TOKEN` secret are live. The "DEAD" status only ever described
   the remote-less *monorepo copy*.
2. The collection is **reference-only** for this platform now. Device/network
   provisioning runs through the Supabase `netmaker-call` edge function (direct
   Netmaker REST — commits f309e78/124e70e); Kestra installs `oriolrius.netmaker`
   **from Galaxy** by FQCN at runtime for the OpenWRT-side flows. Nothing in this
   repo *builds against* the in-repo collection source.
3. The Ansible **Galaxy namespace is `oriolrius`** — an account-level identity
   baked into `galaxy.yml`, independent of whichever GitHub org hosts the source.

A byte-level diff of `ansible/netmaker/` against the standalone repo HEAD
confirmed **every shipped path is identical** (`plugins/`, `galaxy.yml`,
`pyproject.toml`, `meta/`, `docs/`, playbooks, `justfile`, `scripts/`,
`ansible.cfg`). The only monorepo-only deltas are iotgw-ng-specific doc framing
in `CLAUDE.md`/`README.md` (the "Live vs legacy" banner, the decision-014
secrets-remediation note, the "CI is DEAD post-consolidation" wording, and
replacing generic `docker-compose.yml` Netmaker examples — which iotgw-ng
decommissioned but generic collection users still run). None belong in the
standalone collection.

## Decision

**Re-externalize the collection: the standalone repo
`github.com/oriolrius/netmaker-ansible-automation` is the single canonical
source, and the monorepo carries no Ansible collection source.**

- **Adopt the existing oriolrius repo** as canonical — do **not** transfer it to
  the `i40sys` org and do **not** create a fresh repo. A transfer would add risk
  (Galaxy-token re-point, redirect churn) for cosmetic org-consistency, while the
  Galaxy namespace would remain `oriolrius` regardless. (Unlike `iotgw-ng` and
  `kestra-ansible-reporter`, which moved to `i40sys` under `task-067`, this repo
  already publishes to its matching Galaxy namespace and never needed a new home.)
- **Galaxy namespace stays `oriolrius`** (`oriolrius.netmaker`); no republish or
  version bump is required by this move, because no shipped code diverged.
- **Reconcile-then-delete:** confirm the standalone repo HEAD is a superset of
  the monorepo copy (it is), then remove `ansible/netmaker/` from this repo,
  mirroring the `kestra-ansible-reporter` extraction (commits 5408797/47f455b).
- **De-wire the duplicate secret.** `secrets/netmaker.enc.env` (which rendered
  only to `ansible/netmaker/.env`) becomes orphaned and is removed. Its
  `NETMAKER_MASTER_KEY` is a byte-identical duplicate of the live key in
  `secrets/supabase.enc.env`, which the `netmaker-call` edge function reads — so
  the live provisioning path keeps its credential and the long-standing
  "duplicated in both files" footgun (`netmaker-credential-handling.md`) is
  resolved. The shared key is **not** rotated by this move (it is a shared
  production credential outside our control — see `netmaker-credential-handling.md`).

This **resolves the mislocated-CI open question** carried by `decision-012`
(Q2) and `decision-013` (answer 2): automated Galaxy publishing is restored by
keeping CI where it can run — the standalone repo — rather than rebuilding it
in the monorepo.

## Consequences

- **Automated Galaxy publishing is live again**, with zero new CI to maintain in
  this repo. A collection change is made in the standalone repo; its existing
  workflow builds, version-checks, publishes, and cuts a GitHub release.
- **The monorepo no longer carries Ansible source.** The `ansible/` folder is
  removed entirely (it held only this one collection). No `just`/`verify.sh`/
  kustomize/edge-function path resolves into `ansible/`.
- **No runtime change.** Kestra still installs `oriolrius.netmaker` from Galaxy
  by FQCN; `netmaker-call` keeps its own `NETMAKER_MASTER_KEY` in
  `supabase.enc.env`. The edge function's source comments now point to the
  external repo as the reference spec, so the Netmaker REST contract stays
  findable.
- **Docs realigned:** root `README.md` repo map, root `CLAUDE.md` Subprojects
  table + call chain, `kestra/CLAUDE.md`, the `netmaker-call` function docs/code,
  `doc-016`, `netmaker-credential-handling.md`, and the affected `.claude/agents`
  point to `github.com/oriolrius/netmaker-ansible-automation` (+ Galaxy) instead
  of the in-repo path. `decision-012`/`decision-013` get forward-pointer notes;
  their history is preserved, not rewritten.
- References: `decision-012` (consolidation), `decision-013` (organization +
  the deferred CI answer this supersedes), `decision-014` (secrets/SOPS),
  `netmaker-credential-handling.md` (the shared-key disposition). Tracked as
  milestone **Extract netmaker collection to its own repo** (`task-068`).
