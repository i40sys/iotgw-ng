# Backend (apps/backend)

Fastify + tRPC v11 API server for IoT gateway management.

## Stack

Fastify 5, tRPC v11 (HTTP + WebSocket), Supabase JS (service role), Zod, Pino logger, esbuild (production build), Vitest. `superjson` is a dependency but no tRPC transformer is configured.

## Structure

```
src/
├── server.ts              # Fastify setup, CORS, tRPC plugin, WS, port 4444 (PORT), /internal/* routes
├── context.ts             # Supabase client init, operator auth, request context factory
├── logger.ts              # Pino config (pretty in dev, JSON in prod, secret redaction)
├── auth/
│   ├── operator.ts        # Verify GoTrue access token, operator role (decision-034)
│   └── audit.ts           # Audit log line per sensitive operator action
├── internal/
│   ├── ingress-guard.ts   # Refuse /internal/* that came through the ingress
│   └── device-code-routes.ts # Device one-time-code endpoints for edge functions / Kestra
├── routers/
│   ├── trpc.ts            # tRPC init, operatorMiddleware/operatorProcedure, supabaseProcedure
│   ├── router.ts          # Merges all sub-routers via spread
│   ├── devices.ts         # Device CRUD, SSH keys, SSH-CA enrollment, device codes, connectivity, jobs
│   ├── networks.ts        # Network CRUD, domain filtering, jobs
│   ├── domains.ts         # Domain CRUD, pki-manager zone provisioning
│   ├── deployments.ts     # Multi-step deployment, Kestra integration, jobs
│   └── misc.ts            # getDeploymentInfo (decision-036), randomNumber test subscription
├── services/
│   ├── kms.ts             # Cosmian KMS KMIP client (device SSH keys)
│   ├── device-code.ts     # Device one-time codes from a KMS-held seed (decision-033)
│   ├── pki.ts             # pki-manager admin client (zones, CAs, ops user certs)
│   ├── connectivity.ts    # Kestra connectivity-check execution + progress (decision-030)
│   └── deployment-info.ts # Release manifest reader
└── utils/
    ├── query-helper.ts    # createQueryProcedure(name, zodSchema, handler)
    ├── mutation-helper.ts # createMutationProcedure(name, zodSchema, handler)
    └── redact.ts          # Drop secrets from logged inputs
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

HTTP POST to the Kestra API (`KESTRA_API_URL`, basic auth `KESTRA_USER`/`KESTRA_PASSWORD`, FormData payload) for OpenWRT gateway operations only:

- **deployment** — `install`/`provisioning` flows (`deployments.ts`); job rows are reconciled against the execution state
- **connectivity checks** — `connectivity-check` flow (`services/connectivity.ts`, decision-030), started and polled from `devices.ts`
- **SSH-CA re-enroll** — `enrollSshCa` queues the `provisioning` flow (`devices.ts`)

SSH-key generation and device provisioning in Netmaker are **not** Kestra operations (Netmaker runs via the `netmaker-call` edge function).

## Cosmian KMS Integration (SSH keys)

Device SSH keys are generated **directly in Cosmian KMS** by `src/services/kms.ts` — a `fetch`-based client speaking the KMIP 2.1 JSON REST API (`POST <KMS_URL>/kmip/2_1`), deriving the OpenSSH public key locally with `node:crypto` (no `cosmian` CLI / Python). `ensureDeviceSshKey({deviceId,…})` is idempotent (key id `device_ssh_<deviceId>`) with a `force` regenerate path. It runs automatically in `createDevice` (best-effort — a KMS failure leaves the device without a key rather than failing creation) and on demand via `generateMissingSshKey`. Config: `KMS_URL` (default `http://cosmian-kms.kms.svc.cluster.local:9998`) and `KMS_AUTH_TOKEN` — the KMS requires auth (task-057); the token comes from the `kms-auth` Secret (SOPS). See [decision-010](../../../backlog/decisions/decision-010%20-%20SSH-Key-Management-with-Cosmian-KMS.md).

## Device One-Time Codes (decision-033)

`services/device-code.ts`: each device has a random seed in Cosmian KMS (`totp_seed_id`), created best-effort in `createDevice`. Operators read and rotate the code with `getDeviceCode` / `rotateDeviceCode`. The `vpn` / `ssh-ca` edge functions get code candidates from `/internal/device-auth/candidates` (bearer `DEVICE_AUTH_TOKEN`); Kestra provisioning gets the first-enrollment code from `/internal/devices/enroll-code` (bearer `OPS_CERT_MINT_TOKEN`). The seed never leaves the backend.

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
`PKI_OIDC_CLIENT_SECRET` (SOPS → the `pki-oidc` Secret), or interim
`PKI_OIDC_USERNAME` + `PKI_OIDC_PASSWORD` (password grant). Host-cert **signing** for
gateways is NOT done here — that is the `ssh-ca` edge function. See the root
`AGENTS.md` → "The SSH-CA Access Path" and `decision-024..028`.

## References

- [decision-002](../../../backlog/decisions/decision-002%20-%20Backend-Architecture-Fastify-and-tRPC-API-Design.md) — why Fastify + tRPC
- [doc-005](../../../backlog/docs/doc-005%20-%20tRPC-API-Development-Patterns.md) — tRPC procedure/router patterns used here
- [decision-011](../../../backlog/decisions/decision-011%20-%20Get-debug-of-the-connectivity-check-button.md) — Pino logging setup
