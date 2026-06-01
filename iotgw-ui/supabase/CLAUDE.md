# Supabase Migrations (supabase/)

PostgreSQL schema managed via Supabase CLI migrations.

## Tables

- **devices** — IP, MAC, network, domain, TOTP counter, SSH key ID, status
- **networks** — CIDR, VLAN, domain reference
- **domains** — Logical grouping
- **deployments** — Deployment configurations with description
- **deployment_jobs** — Step-by-step deployment execution tracking
- **network_jobs** — Network operation tracking
- **device_jobs** — Device operation tracking

## Key Features

- **RLS policies** for authenticated users (backend uses service role to bypass)
- **RPC functions** for complex queries: `get_device_jobs`, `get_network_jobs`, `get_device_job_by_execution_id`
- **Webhooks** on devices table (insert/delete) for external integration
- **Seed data** in `seed.sql`

## Adding a Migration

1. Create migration file: `supabase migration new <name>`
2. Write SQL in the generated file
3. Apply: `pnpm db:migrate`
4. Regenerate types: `pnpm generate:contract`
5. Update domain types in `packages/supabase-contract/src/` if needed

## References

- [doc-010](../backlog/docs/doc-010%20-%20Database-Migration-and-Webhook-Management-Guide.md) — full migration + webhook workflow (devices/networks triggers live here)
- [doc-003](../backlog/docs/doc-003%20-%20Supabase-RLS-Policy-Implementation-Patterns.md) — RLS patterns
- [doc-008](../backlog/docs/doc-008%20-%20Domains-Networks-and-Devices-Architecture.md) — data model hierarchy
