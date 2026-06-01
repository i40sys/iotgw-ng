# IoT Gateway UI — Codebase Guide

## Project Overview

IoT device/network/domain management platform. Monorepo with pnpm workspaces: React frontend, Fastify/tRPC backend, shared Supabase contract types.

## Architecture

```
apps/app/          → React 19 SPA (Vite, TanStack Router/Query, Tailwind v4, Shadcn/UI)
apps/backend/      → Fastify + tRPC v11 API server (port 4444, WebSocket support)
packages/supabase-contract/ → Auto-generated DB types + domain type overrides
supabase/          → PostgreSQL migrations, seed data, RPC functions
```

**Data flow:** Frontend → tRPC (httpBatchLink) → Backend → Supabase (service role, bypasses RLS)

**External integration:** Kestra workflow orchestration for device operations (SSH keys, connectivity checks).

## Commands

```bash
pnpm dev              # Run frontend + backend (mprocs)
pnpm app              # Frontend only
pnpm backend          # Backend only
pnpm typecheck        # TypeScript checking (always run before submitting)
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm build            # Build all packages
pnpm build:contract   # Build shared types only
pnpm generate:contract # Regenerate Supabase types after schema changes
pnpm test             # Run all tests
```

## Code Style

- **Prettier**: 2-space indent, double quotes, semicolons, 80-char lines, trailing commas
- **TypeScript**: No `any` (use `unknown`), explicit types, `type` imports preferred
- **React**: Functional components, named exports, PascalCase files
- **Imports**: External → Internal → Relative → Types
- **Booleans**: `is`/`has`/`should` prefixes
- **Procedure names**: action-based (`get`, `create`, `update`, `delete`)
- **Comments**: Explain "why" not "what"

## Key Patterns

### tRPC Procedures (Backend)

Use `createQueryProcedure` / `createMutationProcedure` helpers from `src/utils/`. These wrap Supabase calls with standardized error handling, logging, and Zod input validation. Routers are flat-merged via spread in `router.ts`.

### tRPC Client (Frontend)

`createTRPCOptionsProxy` pattern in `src/utils/trpc.ts`. Access via `trpc.routeName.queryOptions()` with TanStack Query.

### Supabase

- Service role key (bypasses RLS) — set via `SUPABASE_SERVICE_KEY`
- Use `.rpc()` for complex queries, `.from()` for simple CRUD
- Contract types auto-generated; domain overrides in separate files for inet/macaddr

### UI Components

Shadcn/UI pattern: Radix primitives + Tailwind + `cva` variants. Include `data-slot` attribute. Use `cn()` from `@/lib/utils` for class merging.

### Routing

TanStack Router with file-based routes in `src/routes/`. Auto-generated route tree. Routes receive `trpc` and `queryClient` via context.

### i18n

react-i18next with `en.json` / `es.json` in `src/i18n/locales/`. Use `useTranslation()` hook. Add keys to both locale files.

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `SUPABASE_URL` | Backend | Supabase instance URL |
| `SUPABASE_SERVICE_KEY` | Backend | Service role key (bypasses RLS) |
| `VITE_API_URL` | Frontend | Backend URL (default: `http://localhost:4444/`) |
| `DATABASE_URL` | Scripts | For Supabase type generation |

## Domain Entities

- **Devices**: IP, MAC, network, domain, TOTP counter, SSH key tracking, status (online/offline/maintenance/unknown)
- **Networks**: CIDR, VLAN, associated domain
- **Domains**: Logical grouping for networks
- **Deployments**: Multi-step config deployment with job tracking via Kestra

## Working Style

- **ACs are the success criteria.** Treat a backlog task's acceptance criteria as the definition of done — implement, verify each with `--check-ac N`, only then set status Done. Don't mark work complete on vibes.
- **Surgical edits.** Touch only what the task requires. Don't reformat, rename, or "improve" adjacent code. If you spot unrelated issues, mention them — don't fix them silently.

<!-- BACKLOG.MD GUIDELINES START -->

# Backlog.md CLI — Task Management

**All task operations MUST use the `backlog` CLI. Never edit task files directly.**

```bash
# View / List
backlog task 42 --plain           # View task (use --plain for AI output)
backlog task list --plain         # List all tasks
backlog task list -s "To Do" --plain

# Create
backlog task create "Title" -d "Description" --ac "Criterion 1" --ac "Criterion 2"

# Edit
backlog task edit 42 -s "In Progress" -a @myself
backlog task edit 42 --plan "1. Step\n2. Step"
backlog task edit 42 --check-ac 1 --check-ac 2   # Multiple ACs at once
backlog task edit 42 --notes "What was done"
backlog task edit 42 -s Done
```

**Task lifecycle:** Create (title, description, AC) → In Progress (add plan) → Done (check ACs, add notes)

**AC flags:** `--ac "text"` (add), `--check-ac N` (check), `--uncheck-ac N`, `--remove-ac N`. Multiple flags per command. No comma-separated or range syntax.

<!-- BACKLOG.MD GUIDELINES END -->
