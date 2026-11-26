# IoT Gateway UI — Codebase Guide

## Project Overview

IoT device/network/domain management platform. Monorepo with pnpm workspaces: React frontend, Fastify/tRPC backend, shared Supabase contract types.

## Architecture

```
apps/app/          → React 19 SPA (Vite 6, TanStack Router/Query, Tailwind v4, Shadcn/UI)
apps/backend/      → Fastify 5 + tRPC v11 API server (port 4444, WebSocket support)
packages/supabase-contract/ → Auto-generated DB types + domain type overrides + deployment-config JSON Schema
supabase/          → PostgreSQL migrations, seed data, RPC functions
```

**Data flow:** Frontend → tRPC (`splitLink`: `httpBatchLink` for queries/mutations, `wsLink` for subscriptions) → Backend → Supabase (service role, bypasses RLS)

**Auth (decision-034):** every tRPC procedure requires an **operator** — a Supabase Auth (GoTrue) user with `app_metadata.iotgw_role` ∈ {operator, admin}. The SPA signs in at `/login` (supabase-js) and sends the access token as a Bearer (WS: `connectionParams.token`); the backend verifies it (`src/auth/operator.ts`) and exposes `ctx.operator`. Sign-up is disabled — create operators with `just operator-create <email> [role]`. `/internal/*` is refused when it comes through the ingress (X-Forwarded-For).

**External integrations (backend):**

- **Cosmian KMS** (`services/kms.ts`) — device SSH keys and the device one-time-code seed (decision-010, decision-033). Not Kestra.
- **pki-manager** (`services/pki.ts`) — one SSH-CA zone per domain (decision-024).
- **Kestra** — OpenWRT gateway operations only: deployments (`install`/`provisioning` flows, `deployments.ts`), connectivity checks (`services/connectivity.ts`, decision-030), SSH-CA re-enroll (`enrollSshCa` → `provisioning`).
- **Netmaker** is not called from here: DB triggers call the `netmaker-call` edge function (root `AGENTS.md` → "The Real Call Chain").

## Commands

```bash
pnpm dev              # Run frontend + backend (mprocs)
pnpm app              # Frontend only (Vite, port 52173)
pnpm backend          # Backend only (port 4444)
pnpm typecheck        # TypeScript checking (always run before submitting)
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm build            # Build all packages
pnpm build:contract   # Build shared types only
pnpm generate:contract # Regenerate Supabase types from the self-hosted DB (DATABASE_URL)
pnpm test             # Run all unit tests (vitest)
pnpm test:app / test:backend          # One package
pnpm --filter @iotgw/app test:e2e     # Playwright (apps/app/e2e)
pnpm --filter @iotgw/backend test:e2e # Backend e2e (vitest.e2e.config.ts)
```

From the repo root, `just e2e` runs the end-to-end check against the kind stack.

**Legacy, do not use:** `pnpm generate:saas` (old Supabase SaaS project; the self-hosted DB is the source of truth, task-108) and `pnpm db:migrate` (see Migrations).

## Migrations

Hand-written, timestamped SQL files in `supabase/migrations/`. They are applied by `deploy/kind/bootstrap.sh migrate` (also run by `just k8s-deploy`). After a schema change, run `pnpm generate:contract` and `pnpm build:contract`.

## Code Style

- **Prettier**: 2-space indent, double quotes, semicolons, 80-char lines, trailing commas
- **TypeScript**: No `any` (use `unknown`), explicit types, `type` imports preferred
- **React**: Functional components, named exports, kebab-case file names (`connectivity-check-dialog.tsx`)
- **Imports**: External → Internal → Relative → Types
- **Booleans**: `is`/`has`/`should` prefixes
- **Procedure names**: action-based (`get`, `create`, `update`, `delete`)
- **Comments**: Explain "why" not "what"

## Key Patterns

### tRPC Procedures (Backend)

Use `createQueryProcedure` / `createMutationProcedure` helpers from `src/utils/`. These wrap Supabase calls with standardized error handling, logging, and Zod input validation, on top of the operator-only `supabaseProcedure`. Routers are flat-merged via spread in `router.ts`.

### tRPC Client (Frontend)

`createTRPCOptionsProxy` pattern in `src/utils/trpc.ts`. Access via `trpc.routeName.queryOptions()` with TanStack Query. UNAUTHORIZED/FORBIDDEN errors sign out and redirect to `/login`.

### Supabase

- Service role key (bypasses RLS) — set via `SUPABASE_SERVICE_KEY`
- Use `.rpc()` for complex queries, `.from()` for simple CRUD
- Contract types auto-generated; domain overrides in separate files for inet/macaddr

### UI Components

Shadcn/UI pattern: Radix primitives + Tailwind + `cva` variants. Add a `data-slot` attribute to new primitives (not all existing ones have it). Use `cn()` from `@/lib/utils` for class merging.

### Routing

TanStack Router with file-based routes in `src/routes/`. Auto-generated route tree. Routes receive `trpc` and `queryClient` via context. The root route redirects to `/login` without a session.

### i18n

react-i18next. The UI is **English-only**: `src/i18n/locales/en.json` is the only maintained locale. Use `useTranslation()` and add keys to `en.json`. Browser-language detection is disabled (`src/i18n/index.ts`).

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `SUPABASE_URL` | Backend | Supabase instance URL |
| `SUPABASE_SERVICE_KEY` | Backend | Service role key (bypasses RLS) |
| `SUPABASE_GATEWAY_URL` | Backend | Kong URL as seen from a Kestra runner pod |
| `JWT_SECRET` | Backend | Verifies operators' GoTrue access tokens (decision-034); unset → every tRPC call is refused |
| `PORT` | Backend | Listen port (default 4444) |
| `NODE_ENV` / `LOG_LEVEL` | Backend | Logger mode and level |
| `KMS_URL` / `KMS_AUTH_TOKEN` | Backend | Cosmian KMS endpoint + bearer token (KMS auth is on, task-057) |
| `KESTRA_API_URL` / `KESTRA_USER` / `KESTRA_PASSWORD` | Backend | Kestra REST API + basic auth |
| `PKI_BASE_URL` / `PKI_OIDC_TOKEN_URL` / `PKI_OIDC_CLIENT_ID` / `PKI_OIDC_CLIENT_SECRET` (or `PKI_OIDC_USERNAME` + `PKI_OIDC_PASSWORD`) | Backend | pki-manager admin credential (decision-028 §9) |
| `OPS_CERT_MINT_TOKEN` | Backend | Bearer for `/internal/ssh/ops-cert` and the provisioning code endpoint |
| `DEVICE_AUTH_TOKEN` | Backend | Bearer for the edge functions' device-code endpoints (decision-033) |
| `IOTGW_RELEASE_MANIFEST_PATH` | Backend | Release manifest for `getDeploymentInfo` (decision-036) |
| `VITE_API_URL` | Frontend | Backend URL (default: `http://localhost:4444/`) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Frontend (build time) | Operator login against Supabase Auth (decision-034) |
| `DATABASE_URL` | Scripts | For Supabase type generation |

## Domain Entities

- **Devices**: name, IP, network (domain via the network), WireGuard keys (from Netmaker), SSH key id (KMS), SSH-CA host-cert fields, one-time-code seed (KMS, decision-033)
- **Networks**: IPv4/IPv6 CIDR, associated domain
- **Domains**: Logical grouping for networks; linked pki-manager zone + CAs
- **Deployments**: Multi-step config deployment with job tracking via Kestra
- **Jobs**: `device_jobs` / `network_jobs` / `deployment_jobs` track async work

## Working Style

- **ACs are the success criteria.** Treat a backlog task's acceptance criteria as the definition of done — implement, verify each with `--check-ac N`, only then set status Done. Don't mark work complete on vibes.
- **Surgical edits.** Touch only what the task requires. Don't reformat, rename, or "improve" adjacent code. If you spot unrelated issues, mention them — don't fix them silently.

> **Formatting `-d`/`--description`, `--notes`, `--plan` (project rule, outside the
> generated block so it survives `backlog agents`):** every free-text field is
> written verbatim and the CLI does **not** interpret `\n` (it stays literal). Never
> put `\n` in these flags. Pass real newlines via a heredoc and write structured
> Markdown — a bold lead line, then bold labels + bullet lists — never a single
> run-on paragraph (a 900-char single-line `-d` is the same wall of text):
> ```bash
> backlog task edit 42 --notes "$(cat <<'EOF'
> **Done.** One-line outcome.
>
> **What changed:**
> - `path` — what and why
> EOF
> )"
> ```

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.55.3-plantuml.2 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**At the beginning of each conversation in this project, run `backlog instructions overview` before answering or taking action. Re-read it only if you have not read it yet in the current conversation.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
