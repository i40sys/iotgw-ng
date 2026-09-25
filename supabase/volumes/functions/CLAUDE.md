# Supabase Edge Functions

Deno-based edge functions served through the Kong gateway at `http://wsl.ymbihq.local:8000/functions/v1/<name>`.

## Functions in this directory

| Function | Trigger | Purpose |
|---|---|---|
| `main/` | dispatcher | Central router. JWT-verifies (when `VERIFY_JWT=true`) and dispatches `/function-name` to the right worker. |
| `netmaker-call/` | DB webhooks on `devices` (INSERT + DELETE) **and** `networks` (INSERT/UPDATE/DELETE) | Provisions/deprovisions Netmaker extclients **and networks directly** via the Netmaker REST API (no Kestra/Ansible). Devices: writes WireGuard keys back to `devices` + tracks `device_jobs`. Networks: creates/updates/deletes the Netmaker network (no write-back) + tracks `network_jobs`. See its own CLAUDE.md. |
| `ssh-ca/` | manual (called by the gateway during enrollment/renewal) | The **only** bridge between an IoT gateway and pki-manager (`decision-024`/`decision-026`, one-time-code auth per `decision-033`). Dispatches on the request's `Content-Type`. Code-envelope actions (`application/octet-stream`, device-auth-authenticated like `vpn`): `trust` returns public trust material (User CA, Host CA, principals); `enroll` — **first enrollment only**, refused 409 once `devices.ssh_host_pubkey` is set — signs the gateway's `host_pubkey` with the domain's **Host CA** and records the PERMANENT enrollment; `live-enroll` (decision-031) returns the trust bundle + a 12 h host cert for the PXE live image's per-boot key under a separate `live-…` FQDN and never touches the device row. Plain-JSON action (`application/json`, unencrypted, no code): `renew` — the gateway proves possession of the *currently enrolled* host key with an SSHSIG (namespace `iotgw-renew`) instead of a code; re-signs the same permanent host record and rolls `ssh_host_pubkey` forward. Holds a zone-scoped **fleet token** (`PKI_FLEET_TOKENS`, sign-host only) — it never sees a private key and never returns the fleet token. Consumed by Ansible `tasks/ssh_ca.yaml` and the gateway agent (`live-image/`). |
| `hello/`, `martin/` | manual | Examples / smoke tests. |
| `vpn/` | manual | One-time-code auth (`decision-033`) for device VPN access — returns the WireGuard config (the combined `?with_ssh_ca=true` bundle was removed: VPN and SSH PKI are independent APIs, decision-031). The reply is always a **sealed JSON** object (`_shared/device-auth.ts` → `sealVpnReply`) built from the decrypted request's `reply_key` (a fresh X25519 public key) — **`reply_key` is now REQUIRED** (`decision-035`/task-135): a request without it gets `426 {"error":"upgrade required: send reply_key (iotgw agent >= v0.3.0)"}` — the legacy code-encrypted reply path has been removed entirely (deploy only after every live image in use sends `reply_key`). **Gateway-held WireGuard key** (`decision-035` §2, task-134): the decrypted request may carry `wg_public_key` (base64, exactly 32 bytes, `400` otherwise). If it differs from `devices.public_key`, `vpn` updates the Netmaker extclient in place (`GET`/`PUT /api/extclients/{network}/{clientid}`, same `netmakerRequest` helper style and UUID-without-dashes convention as `netmaker-call`) — a Netmaker failure is `502` **without** touching the DB. Either way (changed or already equal) `devices` is patched `public_key=<new>, private_key=null`; a patch failure **after** a successful Netmaker update is logged loudly but does not fail the request (Netmaker is the source of truth for the tunnel). The returned config omits the `PrivateKey =` line (replaced with `# PrivateKey: held by the gateway`) whenever `wg_public_key` was sent. A request **without** `wg_public_key` on a device whose `private_key` is already `null` (i.e. already gateway-held) is refused `409 {"error":"this device's WireGuard key is held by the gateway; update the gateway agent"}`. Shares the OpenSSL-compatible envelope + device lookup with `ssh-ca` via `_shared/` (below). Tests: `vpn/index_test.ts` (mocked `fetch` for PostgREST/backend/Netmaker; `handleVpnRequest` is exported and `serve()` only runs when `import.meta.main`). |

> **`_shared/`** — primitives used by BOTH `vpn` and `ssh-ca`, kept identical on
> purpose (`decision-025 §B`): `device-auth.ts` and `pki-manager.ts`.
>
> `device-auth.ts` (rewritten for `decision-033`, task-132.04 — a gateway no
> longer derives its own code):
> - the OpenSSL-compatible `aes-256-cbc -pbkdf2` request envelope
>   (`decryptPayload`/`encryptPayload`, unchanged wire format);
> - `authenticateDevice(body, deviceUuid, purpose)` — the one-time-code flow:
>   `POST {IOTGW_BACKEND_URL}/internal/device-auth/candidates` (bearer
>   `DEVICE_AUTH_TOKEN`) for the codes valid right now, lockout check (429),
>   try each candidate against the envelope, `record_device_otp_failure` RPC
>   on total failure (401), `consume_device_otp` RPC on success (401 if
>   already used) — single-use, consumed **before** any reply is built.
>   `purpose` is one of `vpn` / `ssh-enroll` / `ssh-live-enroll` / `ssh-trust`
>   (must match the DB's `device_otp_uses` check constraint).
>   **Deviation from the literal one-call contract:** `ssh-ca`'s code-envelope
>   actions carry their action (hence their `purpose`) *inside* the
>   still-encrypted body, so the purpose isn't known until after decrypting.
>   `authenticateDevice` is therefore composed from two exported primitives —
>   `decryptDeviceRequest(body, deviceUuid)` (candidates+lockout+decrypt+
>   failure-record, no consume) and `consumeDeviceOtp(deviceId, seedId,
>   purpose, step)` — which `ssh-ca` calls directly once it has parsed the
>   action; `vpn` (purpose known upfront) uses the `authenticateDevice`
>   convenience wrapper. Same checks, same RPCs, same failure modes either way.
> - `consumeDeviceRenew(deviceId, ts)` — the `ssh-ca` `renew` action's replay
>   guard (`consume_device_renew` RPC), no code involved;
> - `sealVpnReply(plaintext, replyKeyB64, deviceId)` — X25519 + HKDF-SHA256 +
>   AES-256-GCM sealing for the `vpn` reply (decision-033 §4); accepts an
>   optional test-only `{ephemeralKeyPair, nonce}` override so a deterministic
>   interop vector can be generated for a non-TypeScript client;
> - `withinTimeWindow(ts, windowSeconds)` — the `renew` action's `|now-ts|`
>   freshness check, extracted for unit testing without a live clock.
>
> `pki-manager.ts` (unchanged) — the minimal sign-host / read-CA-pubkey client
> used by `ssh-ca`.
>
> Tests: `_shared/device-auth_test.ts` (seal round-trip + AAD-mismatch,
> `authenticateDevice` against a mocked `fetch`, `withinTimeWindow`) and
> `_shared/sshsig_test.ts` (renew-signature verification against a fixture
> produced by a real `ssh-keygen -Y sign -n iotgw-renew`). Run with
> `deno test --allow-env supabase/volumes/functions/_shared/*_test.ts`.
>
> `vpn/index_test.ts` (decision-035/task-134/135) drives the exported
> `handleVpnRequest` directly against a monkey-patched `fetch` covering the
> PostgREST device lookup/write-back, the backend candidates endpoint, and
> the Netmaker `GET`/`PUT /api/extclients/...` calls; `vpn/index.ts` only
> calls `serve()` when `import.meta.main` is true, so importing it from a
> test never binds a port. `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` /
> `NETMAKER_BASE_URL` / `NETMAKER_MASTER_KEY` are read at module-import time
> (fail loudly if unset, matching the rest of this codebase) and so **must**
> be exported in the shell environment before `deno test` starts — setting
> them inside the test file is too late (ES module evaluation runs
> `index.ts`'s top level before the test file's own). Run with:
> ```
> SUPABASE_URL=http://rest.test.local SUPABASE_SERVICE_ROLE_KEY=test-key \
> NETMAKER_BASE_URL=http://netmaker.test.local NETMAKER_MASTER_KEY=test-key \
> deno test --allow-env supabase/volumes/functions/vpn/index_test.ts
> ```

## Env vars added for decision-033 (task-132)

- `DEVICE_AUTH_TOKEN` — bearer credential `vpn`/`ssh-ca` present to the
  backend's `/internal/device-auth/candidates`. SOPS-managed (`decision-014`),
  same value the backend expects; **not** a fallback-defaultable secret — both
  functions throw at call time if it's unset.
- `IOTGW_BACKEND_URL` — base URL of the iotgw-ui backend reached from inside
  the cluster. Defaults to
  `http://iotgw-ui-backend.iotgw-ui.svc.cluster.local:4444` if unset (only
  override for a non-standard topology).

(Deployment wiring — adding these to `secrets/supabase.enc.env` and rolling
`deploy/functions` — is tracked separately; see the other task-132 subtasks.)

`vpn` also reads `NETMAKER_BASE_URL` / `NETMAKER_MASTER_KEY` (decision-035 §2,
task-134) — **no new secret needed**: both already exist in
`secrets/supabase.enc.env` for `netmaker-call`, and every function worker gets
the full `supabase-env` Secret via `envFrom` (see "Conventions" below), so
`vpn` picks them up automatically on the next image rebuild + rollout. Same
no-fallback-for-the-key convention as `netmaker-call`: a missing
`NETMAKER_MASTER_KEY` logs FATAL at import and every Netmaker call then fails
with 401 from Netmaker itself, surfaced to the caller as `502`.

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
