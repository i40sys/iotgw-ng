# Supabase Contract Package (packages/supabase-contract)

Shared TypeScript types for the database schema, consumed by both frontend and backend.

## Structure

```
src/
├── index.ts                         # Re-exports the public API
├── database.types.ts                # AUTO-GENERATED — never edit manually
├── database-overrides.types.ts      # Overrides for inet/macaddr fields (Supabase SDK gaps)
├── devices.types.ts                 # Device domain types
├── device.types.ts                  # OLD device model (hostname/mac/os/status) — NOT exported from index.ts
├── network.types.ts                 # Network domain types
├── domain.types.ts                  # Domain domain types
├── deployment-config.schema.json    # The ONE deployment-config JSON Schema (task-130), exported as deploymentConfigSchema
├── deployment-config.validate.ts    # Validator for that schema (used by the UI wizard)
└── deployment-config.example.json   # Example config
```

## Regenerating Types

After any migration in `iotgw-ui/supabase/migrations/`, regenerate from the self-hosted DB (the source of truth, task-108), from `iotgw-ui/`:

```bash
pnpm generate:contract   # supabase gen types from DATABASE_URL (iotgw-ui/.env) — types only
pnpm build:contract      # rebuild dist/ with tsdown
```

`pnpm --filter @iotgw/backend generate` does both steps. `pnpm generate:saas` (Supabase SaaS `--project-id`) is **legacy** — do not use it.

## Rules

- **Never edit `database.types.ts`** — it's auto-generated
- Add domain-specific types in separate files (e.g., `devices.types.ts`)
- Export everything through `index.ts`
- The `database-overrides.types.ts` file patches `inet` and `macaddr` column types that Supabase SDK types as `unknown`
- `x-secret` fields in the deployment-config schema must be masked and never logged
