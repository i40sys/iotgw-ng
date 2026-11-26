# Supabase Migrations (supabase/)

PostgreSQL schema for the platform, kept as hand-written, timestamped SQL files
in `migrations/`. This is the only schema source.

## Tables

- **devices** — IP, MAC, network, domain, SSH key ID, status; device-code seed
  reference + lockout (`totp_seed_id`, `totp_failures`, `totp_locked_until`,
  decision-033) and SSH-CA enrollment (`ssh_host_pubkey`, `ssh_host_fqdn`, …).
  The old `totp_counter` column was dropped (`20260926000000`).
- **networks** — CIDR (IPv4/IPv6), domain reference
- **domains** — Logical grouping
- **deployments** — Deployment configurations with description
- **deployment_jobs** — Step-by-step deployment execution tracking
- **network_jobs** — Network operation tracking
- **device_jobs** — Device operation tracking
- **device_otp_uses** — single-use ledger of consumed device one-time codes (decision-033)
- **device_creation_log** — device creation log

## Key Features

- **RLS policies** for authenticated users (backend uses service role to bypass)
- **RPC functions** for complex queries: `get_device_jobs`, `get_network_jobs`, `get_device_job_by_execution_id`
- **Webhooks** (pg_net triggers) to the `netmaker-call` edge function:
  `devices_webhook` (insert) + `devices_webhook_delete` (delete), and
  `networks_webhook` (insert/update) + `networks_webhook_delete` (delete)
  (`20260623000000_repoint_webhooks_to_kong_fqdn.sql`). The `deployments_webhook`
  (`kestra-dispatch`) was dropped (`20260923000000`).
- `seed.sql` — **legacy, unused**: no script loads it.

## Adding a Migration

1. Write a new file `migrations/<YYYYMMDDHHMMSS>_<name>.sql` by hand. To change
   webhook wiring, add a new `drop trigger if exists …` + `create trigger …`
   migration; do not edit an existing one.
2. Apply it from the repo root with `deploy/kind/bootstrap.sh migrate` (also run
   by `just k8s-deploy`). OVH runs the same script with the OVH kubeconfig
   (`deploy/terraform/ovh/README.md`); Terraform does not apply migrations.
   **Caveat:** `migrate` runs the set only on a fresh DB — it skips when
   `public.devices` already exists. On an existing DB, apply the new file into
   the StackGres primary as superuser, as the script does:
   `kubectl -n supabase-db exec -i <primary-pod> -c patroni -- psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < migrations/<file>.sql`,
   then `kubectl -n supabase-app rollout restart deploy/rest`.
3. Regenerate types: `pnpm generate:contract`
4. Update domain types in `packages/supabase-contract/src/` if needed

> `pnpm db:migrate` / `pnpm db:reset` (`supabase db push` / `db reset` against
> `$DATABASE_URL`) are **legacy and unused** — do not use them on the cluster DB.

## References

- [doc-010](../../backlog/docs/doc-010%20-%20Database-Migration-and-Webhook-Management-Guide.md) — migration + webhook workflow (devices/networks triggers live here)
- [doc-003](../../backlog/docs/doc-003%20-%20Supabase-RLS-Policy-Implementation-Patterns.md) — RLS patterns
- [doc-008](../../backlog/docs/doc-008%20-%20Domains-Networks-and-Devices-Architecture.md) — data model hierarchy
