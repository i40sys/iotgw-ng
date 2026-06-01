# Supabase Edge Functions

Deno-based edge functions served through the Kong gateway at `http://wsl.ymbihq.local:8000/functions/v1/<name>`.

## Functions in this directory

| Function | Trigger | Purpose |
|---|---|---|
| `main/` | dispatcher | Central router. JWT-verifies (when `VERIFY_JWT=true`) and dispatches `/function-name` to the right worker. |
| `kestra-call/` | DB webhook on `devices` + `networks` tables | Starts Kestra flow, tracks job in `device_jobs`/`network_jobs`. See its own CLAUDE.md. |
| `kestra-call_delete/` | (planned) DB webhook on `devices` DELETE | SSH key revocation in KMS (see iotgw-ui task-039). |
| `kestra-call.old/` | — | Deprecated. Do not edit; kept as reference. |
| `hello/`, `martin/` | manual | Examples / smoke tests. |
| `vpn/` | manual | TOTP auth for device VPN access. See iotgw-ui `decision-009`. |
| `about.ipxe`, `menu.ipxe` | HTTP | iPXE boot configs served to PXE-booting devices. |

## Conventions

- One folder per function; `index.ts` with `serve()` handler.
- Env comes from `supabase/.env` via Docker compose (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KESTRA_BASE_URL, etc.).
- After editing code, restart with `docker compose restart functions` from `supabase/`.
- Function logs: `docker compose logs -f supabase-edge-functions` (include transaction IDs).
