---
title: iotgw-ui Application Architecture
category: concepts
tags: [app/iotgw-ui, app/trpc, app/frontend, app/backend, status/current]
relationships:
  - target: "[[concepts/domains-networks-devices]]"
    type: related_to
  - target: "[[entities/supabase]]"
    type: uses
sources:
  - backlog/decisions/decision-001 - Frontend-Technology-Stack-React-19-and-TanStack-Ecosystem.md
  - backlog/decisions/decision-002 - Backend-Architecture-Fastify-and-tRPC-API-Design.md
  - backlog/decisions/decision-004 - Monorepo-Architecture-pnpm-Workspaces-and-Package-Structure.md
  - backlog/decisions/decision-005 - Development-Tooling-Build-and-Development-Experience.md
  - backlog/decisions/decision-006 - Testing-Framework-Vitest-Choice.md
  - backlog/decisions/decision-011 - Debug-Logging-Configuration.md
  - backlog/docs/doc-005 - tRPC-API-Development-Patterns.md
  - backlog/docs/doc-003 - Supabase-RLS-Policy-Implementation-Patterns.md
  - backlog/docs/doc-006 - React-Component-Development-Guidelines.md
  - backlog/docs/doc-015 - Claude-Code-Skills-and-Knowledge-Requirements.md
summary: The iotgw-ui app — React 19 + TanStack + Tailwind v4/Shadcn on the front, Fastify + tRPC v11 + Zod + Pino on the back, end-to-end type-safe over a pnpm workspace.
provenance:
  extracted: 0.85
  inferred: 0.1
  ambiguous: 0.05
base_confidence: 0.78
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: core
created: 2026-06-26
updated: 2026-06-26
---

# iotgw-ui Application Architecture

`iotgw-ui/` is a **full-stack TypeScript monorepo** (pnpm workspace) with
**end-to-end type safety** from the database to the UI.

## Frontend stack (decision-001)

- **React 19** (functional components + hooks).
- **TanStack Router** (file-based, type-safe routes; code splitting) over React Router.
- **TanStack Query + tRPC** for server state (caching/synchronization).
- **Tailwind CSS v4 + Shadcn/UI** (Radix primitives) for styling.
- **React Hook Form + Zod** for forms (Zod schemas shared with the backend).
- **Vite** build tool.

## Backend stack (decision-002)

- **Fastify** over Express (lower overhead, native schema validation,
  `@fastify/websocket` for real-time).
- **tRPC v11** for type-safe APIs — procedure-based, query/mutation split, helper
  `createQueryProcedure`/`createMutationProcedure` for consistency.
- **Zod** validation throughout; **Pino** structured logging.
- A `supabaseMiddleware`/`supabaseProcedure` seam injects the Supabase client into
  the tRPC context (doc-005, doc-003).

## Workspace structure (decision-004)

pnpm workspaces with `@iotgw/`-scoped packages:

```
apps/app/                  # @iotgw/app  — React frontend
apps/backend/              # @iotgw/backend — Fastify/tRPC server
packages/supabase-contract # @iotgw/supabase-contract — generated DB types + shared Zod (built with tsdown)
```

Contract package built first (dependency); the shared `database.types.ts` is the
single source of truth, regenerated via `pnpm generate:contract`.

## Tooling (decision-005, decision-006, decision-011)

- **mprocs** runs the multi-process dev loop; **tsx** for fast TS execution; ESLint
  + Prettier (Tailwind plugin) + strict TypeScript.
- **Vitest** + React Testing Library for tests (decision-006, [[skills/testing-with-vitest]]).
- **`LOG_LEVEL`** env var controls Pino verbosity (decision-011) — `debug`
  surfaces connectivity-check / Kestra parsing detail; no on-disk debug log files.

## Sources

- decision-001/002/004/005/006/011; doc-003/005/006/015 (patterns).
- Related: [[concepts/domains-networks-devices]], [[skills/iotgw-ui-development-workflow]], [[references/deployments-page-behavior]].
