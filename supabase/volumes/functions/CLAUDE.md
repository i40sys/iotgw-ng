# Supabase Edge Functions

Deno-based edge functions served through the Kong gateway at `http://wsl.ymbihq.local:8000/functions/v1/<name>`.

## Functions in this directory

| Function | Trigger | Purpose |
|---|---|---|
| `main/` | dispatcher | Central router. JWT-verifies (when `VERIFY_JWT=true`) and dispatches `/function-name` to the right worker. |
| `netmaker-call/` | DB webhooks on `devices` (INSERT + DELETE) **and** `networks` (INSERT/UPDATE/DELETE) | Provisions/deprovisions Netmaker extclients **and networks directly** via the Netmaker REST API (no Kestra/Ansible). Devices: writes WireGuard keys back to `devices` + tracks `device_jobs`. Networks: creates/updates/deletes the Netmaker network (no write-back) + tracks `network_jobs`. See its own CLAUDE.md. |
| `ssh-ca/` | manual (called by the gateway during enrollment) | The **only** bridge between an IoT gateway and pki-manager (`decision-024`/`decision-026`). Three actions, all TOTP-authenticated as the device (same envelope as `vpn`): `trust` returns public trust material (User CA, Host CA, principals); `enroll` additionally signs the gateway's `host_pubkey` with the domain's **Host CA** and records the PERMANENT enrollment on the device row; `live-enroll` (decision-031) returns the trust bundle + a 12 h host cert for the PXE live image's per-boot key under a separate `live-…` FQDN and never touches the device row — consumed by the live image's `iotgw-bootstrap`. Holds a zone-scoped **fleet token** (`PKI_FLEET_TOKENS`, sign-host only) — it never sees a private key and never returns the fleet token. Consumed by Ansible `tasks/ssh_ca.yaml`. |
| `hello/`, `martin/` | manual | Examples / smoke tests. |
| `vpn/` | manual | TOTP auth for device VPN access — returns the WireGuard config ONLY (the combined `?with_ssh_ca=true` bundle was removed: VPN and SSH PKI are independent APIs, decision-031). See iotgw-ui `decision-009`. Shares the OpenSSL-compatible TOTP envelope + device lookup with `ssh-ca` via `_shared/` (below). |

> **`_shared/`** — primitives used by BOTH `vpn` and `ssh-ca`, kept identical on
> purpose (`decision-025 §B`): `device-auth.ts` (the OpenSSL-compatible
> `aes-256-cbc -pbkdf2` envelope + the RFC-4226 TOTP over a 600 s step, secret =
> `<domainId>-<networkId>-<deviceId>-<totp_counter>`) and `pki-manager.ts` (the
> minimal sign-host / read-CA-pubkey client used by `ssh-ca`).

> **Removed:** the legacy `kestra-call`, `kestra-call_delete`, and
> `kestra-call.old` functions were deleted once devices+networks were repointed
> to `netmaker-call`. The `about.ipxe` / `menu.ipxe` functions were **also
> removed** (`task-101`): they hardcoded `site_name 10.2.0.47:8000`, were baked
> into the image on every build, and were **never on the boot path**. The single
> source of truth for the iPXE menu is `assets/config/menu.ipxe` on `y0`
> (`10.2.0.3`), served by `darkhttpd` as `netboot.joor.net/config/menu.ipxe` —
> that is what a PXE-booting machine actually gets. Kestra is still used for the OpenWRT install/provisioning/
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
  kubectl -n supabase-app rollout restart deploy/functions
  ```

  (`just k8s-deploy` does the same build+load as part of a full apply.) The prod
  overlay pulls a release-pinned tag instead — registry/CI wiring is `task-062.03`.
- Function logs: `kubectl -n supabase-app logs -f deploy/functions` (include transaction IDs).
