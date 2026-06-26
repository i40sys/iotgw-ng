---
title: Netmaker Collection Externalization
category: synthesis
tags: [orchestration/ansible, vpn/netmaker, type/decision, status/current]
sources:
  - backlog/decisions/decision-022 - Re-externalize-the-oriolrius.netmaker-Ansible-collection.md
  - backlog/decisions/decision-012 - Workspace-Git-Consolidation-into-a-Single-Root-Repository.md
  - backlog/decisions/decision-013 - Monorepo-Organization-Single-Repo-with-Logical-Grouping.md
  - backlog/tasks/task-068 - Epic-Re-externalize-the-oriolrius.netmaker-Ansible-collection-out-of-the-monorepo.md
relationships:
  - target: "[[concepts/monorepo-organization]]"
    type: related_to
summary: Why the oriolrius.netmaker Ansible collection was pulled back out of the monorepo to its standalone repo — resolving the mislocated-CI question and de-wiring a duplicate secret, zero runtime change.
provenance:
  extracted: 0.9
  inferred: 0.05
  ambiguous: 0.05
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Netmaker Collection Externalization

The `decision-012` consolidation pulled the standalone repo
`github.com/oriolrius/netmaker-ansible-automation` into the monorepo as
`ansible/netmaker/`. **decision-022 reverses that specific move.**

## Decision

**Re-externalize the collection:** the standalone repo
`github.com/oriolrius/netmaker-ansible-automation` is the single canonical source,
and the monorepo carries **no Ansible collection source**.

- **Adopt the existing oriolrius repo** as canonical — do not transfer it to
  `i40sys`, do not create a fresh repo. The Galaxy namespace is `oriolrius`
  regardless (`oriolrius.netmaker`), and the standalone repo's Galaxy-publish CI
  still works (last green 2025-10-21).
- A **byte-level diff** confirmed every shipped path is identical; the only
  monorepo deltas were iotgw-ng-specific doc framing that doesn't belong in the
  generic collection.
- **Reconcile-then-delete:** confirm the standalone HEAD is a superset, then
  remove `ansible/netmaker/` (mirroring the `kestra-ansible-reporter` extraction).

## Why this resolves two old open questions

It closes the **mislocated-CI** question carried by decision-012 (Q2) and
decision-013 (answer 2): automated Galaxy publishing is restored by keeping CI
**where it can run** (the standalone repo), rather than rebuilding it in the
monorepo (which was deferred and never built).

## Secret de-wiring (footgun resolved)

`secrets/netmaker.enc.env` (which rendered only to `ansible/netmaker/.env`)
became orphaned and was **removed**. Its `NETMAKER_MASTER_KEY` was a byte-identical
duplicate of the live key in `secrets/supabase.enc.env` (which `netmaker-call`
reads), so the live path keeps its credential and the long-standing
"duplicated in both files" footgun is gone. The shared key is **not** rotated by
this move ([[synthesis/secret-exposure-rotation-runbook]]).

## No runtime change

Kestra still installs `oriolrius.netmaker` **from Galaxy** by FQCN; the
`netmaker-call` edge function mirrors the same Netmaker REST contract (its source
comments now point to the external repo as the reference spec).
See [[entities/netmaker]].

## Execution (task-068, Done 2026-06-25)

Carried out as the **`TASK-068` milestone** (8 subtasks). The "double-check"
finding: the standalone repo already existed and was live (Galaxy-publishing,
last green 2025-10-21), and a byte-level diff proved every shipped path was
already identical — so **no port-back, no version bump, no republish**, just
adopt-as-canonical + de-dupe. `ansible/` removed entirely; mirrors the
`kestra-ansible-reporter` extraction precedent.

## Sources

- decision-022 (re-externalization), decision-012 / decision-013 (the questions it resolves).
- Related: [[concepts/monorepo-organization]], [[entities/netmaker]], [[entities/kestra]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/decisions/decision-022 - Re-externalize-the-oriolrius.netmaker-Ansible-collection|decision-022 - Re-externalize-the-oriolrius.netmaker-Ansible-collection]]
- [[_sources/decisions/decision-012 - Workspace-Git-Consolidation-into-a-Single-Root-Repository|decision-012 - Workspace-Git-Consolidation-into-a-Single-Root-Repository]]
- [[_sources/decisions/decision-013 - Monorepo-Organization-Single-Repo-with-Logical-Grouping|decision-013 - Monorepo-Organization-Single-Repo-with-Logical-Grouping]]
- [[_sources/tasks/task-068 - Epic-Re-externalize-the-oriolrius.netmaker-Ansible-collection-out-of-the-monorepo|task-068 - Epic-Re-externalize-the-oriolrius.netmaker-Ansible-collection-out-of-the-monorepo]]
