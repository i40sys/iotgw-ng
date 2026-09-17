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

Device SSH keys are generated **directly in Cosmian KMS** by `src/services/kms.ts` — a `fetch`-based client speaking the KMIP 2.1 JSON REST API (`POST <KMS_URL>/kmip/2_1`), deriving the OpenSSH public key locally with `node:crypto` (no `cosmian` CLI / Python). `ensureDeviceSshKey({deviceId,…})` is idempotent (key id `device_ssh_<deviceId>`) with a `force` regenerate path. It runs automatically in `createDevice` (best-effort — a KMS failure leaves the device without a key rather than failing creation) and on demand via `generateMissingSshKey`. Config: `KMS_URL` (env, from `secrets/`; default the dev host); auth-header-ready for when the KMS gains auth. See [decision-010](../../../backlog/decisions/decision-010-ssh-key-management-with-cosmian-kms.md).

## pki-manager Integration (SSH certificates)

Two DIFFERENT SSH stories live here — don't conflate them:

- **KMS device key (above)** — a raw per-device SSH key in Cosmian KMS
  (`device_ssh_<id>`). It is the **break-glass / legacy** access key the Kestra
  runner has historically used to reach a gateway.
- **SSH CA certificates (`services/pki.ts`, `task-080`)** — the target access model
  (`decision-024`). The backend holds an **OIDC admin credential for pki-manager**
  (a Keycloak service account, `PKI_OIDC_*`; `decision-028 §9`) and, when a domain
  is created, provisions that domain's pki-manager **zone + user CA + host CA +
  principals** (`iotgw-admin`, `iotgw-ops`), persisting the ids on the `domains`
  row (`pki_zone`, `pki_user_ca_id`, `pki_host_ca_id`).

`ensureDomainPkiZone` is idempotent + resumable (detect-then-create, every call
passes the zone explicitly). It runs **best-effort in `createDomain`** — a PKI
failure leaves the domain UNLINKED (enrollment then fails closed) rather than
failing domain creation, exactly like the KMS-key mint pattern — plus a
`provisionPkiZone` mutation for backfill/retry that surfaces errors. This client is
**admin** (create zones/CAs); it is distinct from the edge function's
`_shared/pki-manager.ts`, which only signs host certs with a zone-scoped fleet
token. Config: `PKI_BASE_URL`, `PKI_OIDC_TOKEN_URL`, `PKI_OIDC_CLIENT_ID`,
`PKI_OIDC_CLIENT_SECRET` (SOPS → the `pki-oidc` Secret). Host-cert **signing** for
gateways is NOT done here — that is the `ssh-ca` edge function. See the root
`CLAUDE.md` → "The SSH-CA Access Path" and `decision-024..028`.

## References

- [decision-002](../../../backlog/decisions/decision-002-backend-architecture-fastify-and-trpc-api-design.md) — why Fastify + tRPC
- [doc-005](../../../backlog/docs/doc-005-trpc-api-development-patterns.md) — tRPC procedure/router patterns used here
- [decision-011](../../../backlog/decisions/decision-011-get-debug-of-the-connectivity-check-button.md) — Pino logging setup
