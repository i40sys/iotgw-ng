---
title: Monorepo Organization
category: concepts
tags: [type/decision, status/current]
relationships:
  - target: "[[concepts/secrets-management-sops-age]]"
    type: related_to
  - target: "[[concepts/kubernetes-migration-kind]]"
    type: related_to
sources:
  - backlog/decisions/decision-012 - Workspace-Git-Consolidation-into-a-Single-Root-Repository.md
  - backlog/decisions/decision-013 - Monorepo-Organization-Single-Repo-with-Logical-Grouping.md
  - backlog/tasks/task-068 - Epic-Re-externalize-the-oriolrius.netmaker-Ansible-collection-out-of-the-monorepo.md
summary: Seven nested repos were consolidated into one flat root repo (Outcome A); logical grouping via a documented taxonomy + a root just orchestrator, not a physical re-layout.
provenance:
  extracted: 0.85
  inferred: 0.05
  ambiguous: 0.1
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Monorepo Organization

`~/iotgw-ng` **is a single git repository** holding the whole platform. Seven
formerly independent nested repos (iotgw-ui, kms, supabase, edge-functions,
ansible/netmaker, kestra-ansible-reporter, the Kestra `_files` volume) were
collapsed into one root repo on 2026-05-29 (decision-012, executed) and the
organization was **finalized** by decision-013 (Outcome A).

## Decision (decision-013, finalizing decision-012)

**Adopt a single flat monorepo** with a *logical* grouping layer rather than a
disruptive physical re-layout (the stack dirs keep their locations because their
bind mounts and root-owned runtime volumes are path-coupled). Structure is
expressed through a documented taxonomy, top-level infra dirs, and a root `just`
orchestrator + `README.md`.

Logical taxonomy: **app** (`iotgw-ui/`), **platform** (`supabase/`, `kestra/`,
`kms/`), **edge** (`deploy/` Ingress), **infra** (`deploy/`, `secrets/`,
`tools/`), **docs/meta** (`backlog/`, `.claude/`).

## Answers to decision-012's open questions

- **Orphaned remotes** → abandoned as code remotes; monorepo is the single source
  of truth; `BACKUP/git-archives/` is the reversibility net.
- **Mislocated Ansible CI** → later resolved by re-externalizing the collection
  (decision-022, see [[synthesis/netmaker-collection-externalization]]).
- **Root repo remote** → pushed to private Gitea `oriolrius/iotgw-ng` (2026-06-17);
  later migrated to public GitHub `i40sys/iotgw-ng` (decision-021).
- **Kestra flow carve-out** → accepted; flows live in Postgres + the
  `i40sys/iotgw-kestra` repo, re-imported via a sync flow.
- **Secrets in history** → rotate (see [[synthesis/secret-exposure-rotation-runbook]]).

> [!note] decision-004 scope
> decision-004 (pnpm workspaces) concerns the **internal** workspace *within*
> `iotgw-ui` (`apps/` + `packages/`), not this workspace-level monorepo. See
> [[concepts/iotgw-ui-architecture]].

Pre-consolidation `.git` archives live in `BACKUP/git-archives/` — restore any
subproject with `tar xzf BACKUP/git-archives/<name>.git.tar.gz -C <path>`.

## Sources

- decision-012 (consolidation, interim/superseded), decision-013 (finalization).
- Related: [[synthesis/netmaker-collection-externalization]], [[references/container-image-cicd]].
