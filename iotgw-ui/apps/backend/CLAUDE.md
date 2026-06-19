# Backend (apps/backend)

Fastify + tRPC v11 API server for IoT gateway management.

## Stack

Fastify 5, tRPC v11 (HTTP + WebSocket), Supabase JS (service role), Zod, Pino logger, SuperJSON, esbuild (production build).

## Structure

```
src/
├── server.ts              # Fastify setup, CORS, tRPC plugin, WS, port 4444
├── context.ts             # Supabase client init, request context factory
├── logger.ts              # Pino config (pretty in dev, JSON in prod)
├── routers/
│   ├── trpc.ts            # tRPC init, supabaseMiddleware, supabaseProcedure
│   ├── router.ts          # Merges all sub-routers via spread
│   ├── devices.ts         # Device CRUD, SSH keys, TOTP, connectivity, jobs
│   ├── networks.ts        # Network CRUD, domain filtering, jobs
│   ├── domains.ts         # Domain CRUD
│   ├── deployments.ts     # Multi-step deployment, Kestra integration, jobs
│   └── misc.ts            # Health checks, utilities
└── utils/
    ├── query-helper.ts    # createQueryProcedure(name, zodSchema, handler)
    └── mutation-helper.ts # createMutationProcedure(name, zodSchema, handler)
```

## Adding a New Endpoint

1. Use `createQueryProcedure` (reads) or `createMutationProcedure` (writes) from `src/utils/`
2. Define Zod input schema inline
3. Access Supabase via `ctx.supabase` (service role, bypasses RLS)
4. Throw `TRPCError` with appropriate code for known errors
5. Export as part of a router object (e.g., `export const fooRouter = { getFoo, createFoo }`)
6. Spread into `appRouter` in `router.ts`

## Error Handling

The helpers auto-wrap with try/catch and log via Pino. For specific Supabase errors, throw `TRPCError` inside the handler:
- `PGRST116` → `NOT_FOUND`
- `23505` → `CONFLICT` (unique violation)
- `23503` → `BAD_REQUEST` (FK violation)

## Supabase Patterns

- Simple CRUD: `ctx.supabase.from("table").select/insert/update/delete`
- Complex queries: `ctx.supabase.rpc("function_name", params)` (RPC functions defined in migrations)
- Always destructure `{ data, error }` and check error

## Kestra Integration

HTTP POST to the Kestra API for OpenWRT gateway operations — **deployment** (`install`/`provisioning` flows, `deployments.ts`) and **connectivity checks** (`devices.ts`). Uses basic auth, FormData payload, polling for completion with timeout. SSH-key generation is **not** a Kestra operation (see below).

## Cosmian KMS Integration (SSH keys)

Device SSH keys are generated **directly in Cosmian KMS** by `src/services/kms.ts` — a `fetch`-based client speaking the KMIP 2.1 JSON REST API (`POST <KMS_URL>/kmip/2_1`), deriving the OpenSSH public key locally with `node:crypto` (no `cosmian` CLI / Python). `ensureDeviceSshKey({deviceId,…})` is idempotent (key id `device_ssh_<deviceId>`) with a `force` regenerate path. It runs automatically in `createDevice` (best-effort — a KMS failure leaves the device without a key rather than failing creation) and on demand via `generateMissingSshKey`. Config: `KMS_URL` (env, from `secrets/`; default the dev host); auth-header-ready for when the KMS gains auth. See [decision-010](../../backlog/decisions/decision-010%20-%20ADR-001-SSH-Key-Management-with-Cosmian-KMS.md).

## References

- [decision-002](../../backlog/decisions/decision-002%20-%20Backend-Architecture-Fastify-and-tRPC-API-Design.md) — why Fastify + tRPC
- [doc-005](../../backlog/docs/doc-005%20-%20tRPC-API-Development-Patterns.md) — tRPC procedure/router patterns used here
- [decision-011](../../backlog/decisions/decision-011%20-%20Debug-Logging-Configuration.md) — Pino logging setup
