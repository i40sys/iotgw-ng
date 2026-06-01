# Supabase Contract Package (packages/supabase-contract)

Shared TypeScript types for the database schema, consumed by both frontend and backend.

## Structure

```
src/
├── index.ts                    # Re-exports everything
├── database.types.ts           # AUTO-GENERATED — never edit manually
├── database-overrides.types.ts # Overrides for inet/macaddr fields (Supabase SDK gaps)
├── devices.types.ts            # Device domain types
├── device.types.ts             # Single device type
├── network.types.ts            # Network domain types
└── domain.types.ts             # Domain domain types
```

## Regenerating Types

After any Supabase migration:

```bash
pnpm generate:contract   # Uses DATABASE_URL for local/self-hosted
pnpm generate:saas       # Uses --project-id for Supabase SaaS
```

This runs `supabase gen types` and rebuilds with `tsdown`.

## Rules

- **Never edit `database.types.ts`** — it's auto-generated
- Add domain-specific types in separate files (e.g., `devices.types.ts`)
- Export everything through `index.ts`
- The `database-overrides.types.ts` file patches `inet` and `macaddr` column types that Supabase SDK types as `unknown`
