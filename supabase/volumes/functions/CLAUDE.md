# Supabase Edge Functions

Deno-based edge functions served through the Kong gateway at `http://wsl.ymbihq.local:8000/functions/v1/<name>`.

## Functions in this directory

| Function | Trigger | Purpose |
|---|---|---|
| `main/` | dispatcher | Central router. JWT-verifies (when `VERIFY_JWT=true`) and dispatches `/function-name` to the right worker. |
| `netmaker-call/` | DB webhooks on `devices` (INSERT + DELETE) **and** `networks` (INSERT/UPDATE/DELETE) | Provisions/deprovisions Netmaker extclients **and networks directly** via the Netmaker REST API (no Kestra/Ansible). Devices: writes WireGuard keys back to `devices` + tracks `device_jobs`. Networks: creates/updates/deletes the Netmaker network (no write-back) + tracks `network_jobs`. See its own CLAUDE.md. |
| `hello/`, `martin/` | manual | Examples / smoke tests. |
| `vpn/` | manual | TOTP auth for device VPN access. See iotgw-ui `decision-009`. |
| `about.ipxe`, `menu.ipxe` | HTTP | iPXE boot configs served to PXE-booting devices. |

> **Removed:** the legacy `kestra-call`, `kestra-call_delete`, and
> `kestra-call.old` functions were deleted once devices+networks were repointed
> to `netmaker-call`. Kestra is still used for the OpenWRT install/provisioning/
> connectivity flows and SSH-key generation, but those are triggered directly
> from the iotgw-ui backend (see `iotgw-ui/apps/backend/src/routers/`), not via
> an edge function.

## Conventions

- One folder per function; `index.ts` with `serve()` handler.
- Env comes from `supabase/.env` via Docker compose (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KESTRA_BASE_URL, etc.).
- After editing code, restart with `docker compose restart functions` from `supabase/`.
- Function logs: `docker compose logs -f supabase-edge-functions` (include transaction IDs).
