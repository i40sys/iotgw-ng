# Supabase Edge Functions

Deno-based edge functions served through the Kong gateway at `http://wsl.ymbihq.local:8000/functions/v1/<name>`.

## Functions in this directory

| Function | Trigger | Purpose |
|---|---|---|
| `main/` | dispatcher | Central router. JWT-verifies (when `VERIFY_JWT=true`) and dispatches `/function-name` to the right worker. |
| `netmaker-call/` | DB webhooks on `devices` (INSERT + DELETE) **and** `networks` (INSERT/UPDATE/DELETE) | Provisions/deprovisions Netmaker extclients **and networks directly** via the Netmaker REST API (no Kestra/Ansible). Devices: writes WireGuard keys back to `devices` + tracks `device_jobs`. Networks: creates/updates/deletes the Netmaker network (no write-back) + tracks `network_jobs`. See its own CLAUDE.md. |
| `kestra-dispatch/` | DB webhook on `deployments` (INSERT only) | Thin Kestra handoff (decision-016 §6): fetches device/network/domain context, inserts `deployment_jobs` PENDING, triggers a Kestra flow (`k8s-ansible-runner-test` by default; override `KESTRA_DISPATCH_FLOW_ID` env), returns 202. Kestra write-back sets final status. See its own CLAUDE.md. |
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
- **Env injection (k8s).** The functions Deployment loads its environment from
  the `supabase-env` Secret (`envFrom`), created from `secrets/supabase.enc.env`
  by `deploy/kind/bootstrap.sh make_secrets` (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  NETMAKER_*, etc.). To add/change an env var: edit `secrets/supabase.enc.env`
  (`just secrets-edit supabase`), then re-run `secrets` + roll the deployment
  (see below). There is no `.env` / compose env block.
- **Deploying code changes (image bake + rollout).** Function code is **baked
  into the `iotgw-functions:local` image** (not bind-mounted). To ship an edit:

  ```bash
  deploy/kind/bootstrap.sh functions          # docker build iotgw-functions:local + kind load
  kubectl -n iotgw rollout restart deploy/functions
  ```

  (`just k8s-deploy` does the same build+load as part of a full apply.) The prod
  overlay pulls a release-pinned tag instead — registry/CI wiring is `task-062.03`.
- Function logs: `kubectl -n iotgw logs -f deploy/functions` (include transaction IDs).
