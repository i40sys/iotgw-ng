---
title: iotgw-ui Development Workflow
category: skills
tags: [app/iotgw-ui, app/backend, app/frontend, status/current]
sources:
  - backlog/docs/doc-007-workspace-development-workflow.md
  - backlog/decisions/decision-005-development-tooling-build-and-development-experience.md
  - backlog/decisions/decision-004-monorepo-architecture-pnpm-workspaces-and-package-structure.md
  - backlog/docs/doc-015-claude-code-skills-and-knowledge-requirements.md
relationships:
  - target: "[[concepts/iotgw-ui-architecture]]"
    type: related_to
summary: The pnpm-workspace dev loop for iotgw-ui — mprocs multi-process dev, build order (contract first), the pnpm command surface, and where to look when things break.
provenance:
  extracted: 0.82
  inferred: 0.12
  ambiguous: 0.06
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# iotgw-ui Development Workflow

Working inside the `iotgw-ui/` pnpm workspace ([[concepts/iotgw-ui-architecture]]).

## Command surface

```bash
pnpm dev          # run all services concurrently with mprocs (mprocs.yaml)
pnpm backend      # backend API only
pnpm app          # frontend only
pnpm typecheck    # type-check all packages
pnpm lint         # lint all packages
pnpm format       # format all code
pnpm build        # build all packages in dependency order
```

DB/contract commands run from `iotgw-ui/`
([[references/database-migrations-webhooks]]): `pnpm db:reset`, `pnpm db:migrate`,
`pnpm generate:contract`.

## Build order & coordination

- **Contract package first** — `@iotgw/supabase-contract` (generated DB types +
  shared Zod) is a dependency of both apps; built with **tsdown** (dual ESM/CJS).
- **mprocs** runs the multi-process dev loop (better than npm-run-all for the
  frontend + backend + watch scenario); **tsx** gives fast hot-reload TS
  execution on the backend.
- Shared ESLint/Prettier/TypeScript configs at the workspace root; TypeScript
  project references for incremental compilation.

## Cross-project change order

Follow the call chain top-down: schema (`iotgw-ui/supabase/migrations/`) →
contract types (`packages/supabase-contract`) → backend/edge function → (for
OpenWRT) Kestra flow → Ansible. Run `pnpm generate:contract && pnpm typecheck`
after any schema change.

## Debug logging

Set `LOG_LEVEL=debug` (decision-011) to surface connectivity-check / Kestra
parsing detail through the existing Pino logger — no on-disk debug log files.

## Stack note

The `iotgw-ui` **dev server** (`pnpm dev` against an in-cluster backend) remains a
valid local convenience even though the platform services run on k8s, not compose
([[synthesis/docker-compose-decommission]]).

## Sources

- doc-007 (workspace workflow), decision-005 (tooling), decision-004 (pnpm
  workspaces), doc-015 (skills/knowledge map).
- Related: [[concepts/iotgw-ui-architecture]], [[skills/testing-with-vitest]], [[skills/deploy-on-kind]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/docs/doc-007-workspace-development-workflow|doc-007-workspace-development-workflow]]
- [[_sources/decisions/decision-005-development-tooling-build-and-development-experience|decision-005-development-tooling-build-and-development-experience]]
- [[_sources/decisions/decision-004-monorepo-architecture-pnpm-workspaces-and-package-structure|decision-004-monorepo-architecture-pnpm-workspaces-and-package-structure]]
- [[_sources/docs/doc-015-claude-code-skills-and-knowledge-requirements|doc-015-claude-code-skills-and-knowledge-requirements]]
