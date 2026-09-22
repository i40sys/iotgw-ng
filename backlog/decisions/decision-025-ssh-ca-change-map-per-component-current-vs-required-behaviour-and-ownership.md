---
id: decision-025
title: "025: SSH CA change map — per-component current vs required behaviour and ownership"
date: '2026-09-14 07:50'
status: proposed
---
## Context

`decision-023` lists what exists, `decision-024` what we want. This ADR is the
bridge: every affected file, service or repository, with its current behaviour,
its required behaviour, the concrete change, and the subsystem that owns it.

Owner legend: **ING** `iotgw-ng` repo · **PKI** `pki-manager` · **EF** Supabase
edge functions · **ANS** Ansible (in `owrt_iot_gw` and the Kestra namespace
blob) · **IMG** live-image / `y0` · **BOOT** gateway bootstrap · **DB** database
& API layer · **OPS** operator/client tooling.

---

## A. Live image (`y0` — IMG)

| Item | Current | Required | Change | Owner |
|---|---|---|---|---|
| `squashfs-root/root/.ssh/authorized_keys` | 3 hardcoded individual pubkeys, one unattributed | Break-glass only: a **named, minimal** set, present during migration, removable afterwards | Trim to the two attributed keys; delete the unattributed `SHA256:VMJ3Hr…` entry or attribute it. Move to `/root/.ssh/authorized_keys` managed as an explicit break-glass file | IMG |
| `squashfs-root/root/.ssh/id_ed25519` (+`.pub`) | **static private key baked into the image**, identical on every boot | no private key in the image | Delete both files | IMG |
| `squashfs-root/etc/ssh/sshd_config` | `Include /etc/ssh/sshd_config.d/*.conf` present, `PermitRootLogin yes`, drop-in dir empty | trusts the User CA of every `iotgw-ng` zone; keeps break-glass | Add `etc/ssh/sshd_config.d/60-iotgw-ssh-ca.conf` (`TrustedUserCAKeys`, `AuthorizedPrincipalsFile`, `RevokedKeys`) and `50-iotgw-authorized-keys.conf` (break-glass, sorts first so `AuthorizedKeysFile` wins). Do **not** weaken any existing setting | IMG |
| `squashfs-root/etc/ssh/ssh-user-ca.pub` | absent | the concatenated `active`+`rotating` User CA keys of every `iotgw-ng` zone | New file, 0444 | IMG + PKI (content) |
| `squashfs-root/etc/ssh/auth_principals/root` | absent | `iotgw-admin`, `iotgw-ops` | New file, 0644 | IMG |
| host keys in the image | none — regenerated per live boot, pure TOFU | live phase either stays TOFU (documented) or gets a short-lived host cert | **Unresolved** — `decision-028` §5 | IMG |
| image build | no pipeline; `squashfs-root/` unpacked on disk, repacked by hand with `mksquashfs`; served read-only by `darkhttpd` | a scripted, reviewable rebuild | Add `scripts/live-image/` in `iotgw-ng` (render trust material → rsync into `squashfs-root/` → `mksquashfs` → atomic swap with `.bak` retained) | ING + IMG |
| `assets/config/menu.ipxe` on `y0` | the real, served menu (`site_name netboot.joor.net`) | unchanged by this migration | none | IMG |
| `supabase/volumes/functions/{menu.ipxe,about.ipxe}` | **stale duplicates** of the above pointing at `10.2.0.47:8000`; not on the boot path | either the single source of truth or deleted | Out of scope here; flag as dead code (`task` in the milestone) | EF |

---

## B. Edge functions (EF)

| Item | Current | Required | Change | Owner |
|---|---|---|---|---|
| `supabase/volumes/functions/ssh-ca/` | **does not exist** | the sole gateway↔PKI broker | **New function.** TOTP-authenticated exactly like `vpn` (same PBKDF2/AES-256-CBC envelope, same `device_id` `<name>@<networkPrefix>` form, same ±1×600 s window). Routes: `enroll` (sign host key + return trust bundle) and `trust` (trust material only, no signing) | EF |
| `supabase/volumes/functions/vpn/index.ts` | returns only the WireGuard `wg0.conf`, encrypted with the device TOTP | the same call also yields SSH trust material, per the requirement *"in the process of getting WireGuard configuration we'll also install SSH user and host CAs"* | Add an opt-in `?with_ssh_ca=1` (or `ssh_host_pubkey` in the encrypted request body) that appends the trust bundle to the encrypted response. Keep the legacy response byte-identical when the flag is absent | EF |
| TOTP verification code | duplicated inside `vpn/index.ts` | shared | Extract `_shared/totp.ts` + `_shared/crypto.ts`; both functions import it | EF |
| Secrets | `supabase-env` Secret from `secrets/supabase.enc.env` | + `PKI_BASE_URL`, `PKI_FLEET_TOKEN_<ZONE>` (or a JSON map) | Add keys to the SOPS store; no plaintext anywhere | ING |
| `netmaker-call`, `kestra-dispatch`, `main` | unaffected | unaffected | none | — |

---

## C. Ansible (ANS)

All paths are relative to `owrt_iot_gw/playbooks/` **and** its mirror
`kestra/data/main/iotgw-ng/_files/` — both must change, and the Kestra copy must
be pushed through `github.com/i40sys/iotgw-kestra` + `sync-namespace-files`.

| Item | Current | Required | Change | Owner |
|---|---|---|---|---|
| `tasks/ssh_ca.yaml` | **does not exist** | idempotent SSH-CA enrollment of a gateway | **New task file**: ensure ecdsa host key → POST the pubkey to the `ssh-ca` edge fn (TOTP-signed) → install host cert / user-CA anchor / host-CA anchor / `auth_principals` / drop-in → `sshd -t` → `reload`, never `restart` | ANS |
| `tasks/system.yaml` L76-86 | copies the **shared** `credentials/id_rsa{,.pub}` to `/root/.ssh/` on every gateway | no shared private key on any gateway | Phase 1: leave in place (12 other tasks depend on `/root/.ssh/id_rsa`). Phase 3: replace with a per-device key or a certificate-authenticated path, then delete | ANS |
| `tasks/system.yaml` L64-74 | `lineinfile` on `sshd_config` with **no `validate:`**, then `reload` **and** `restart` | validated, reload-only | Add `validate: /usr/sbin/sshd -t -f %s`; drop the `restart`; make the handler a `reload` | ANS |
| `tasks/system.yaml` | never sets `PasswordAuthentication` / `PermitRootLogin` explicitly | explicit, no weakening | Add explicit `PubkeyAuthentication yes`; leave `PermitRootLogin`/password settings **unchanged** in phase 1 and tighten only in phase 3 with a documented AC | ANS |
| `files/enable_ansible.sh` L24-28 | `wget github.com/sabatligats.keys` + `u.joor.net/ssh-pub-key` → `/root/.ssh/authorized_keys` over plain HTTP redirects | no public-internet trust root | Phase 1: keep (break-glass) but pin to a **vendored** copy shipped in the namespace blob instead of a live download. Phase 3: delete the block entirely | ANS / BOOT |
| `files/enable_ansible.sh` | also installs the User CA? no | the freshly-installed rootfs should trust the User CA **before first boot**, so cert login works even if provisioning never runs | Add: write `/etc/ssh/ssh-user-ca.pub`, `/etc/ssh/auth_principals/root`, `/etc/ssh/sshd_config.d/60-iotgw-ssh-ca.conf`, and ensure `Include /etc/ssh/sshd_config.d/*.conf` exists in OpenWRT's `sshd_config` | ANS / BOOT |
| `i11_provisioning_iotgw.yaml`, `i11_install_iotgw.yaml` | no SSH-CA step | enroll the gateway | `import_tasks: tasks/ssh_ca.yaml` with `tags: ssh_ca`, placed **after** `system` so the host is reachable, and guarded by `when: iotgw_ssh_ca_enabled | default(true)` | ANS |
| `templates/inventory.j2`, `Flow.yaml`, `install-flow.yaml`, `connectivity-check-flow.yaml` inventories | `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null` on every connection, including the bastion `ProxyCommand` | verify gateways against the Host CA | Generate a `known_hosts` containing the zone's `@cert-authority` line; set `StrictHostKeyChecking=yes` + `UserKnownHostsFile=known_hosts` once phase 3 completes. Keep `no` for the **live-boot** phase until `decision-028` §5 resolves | ANS |
| `keys/id_rsa` (namespace file) | the personal `oriol@mini6` key; overwritten from KMS when `SSH_KEY_ID` is set (task-069) | the runner authenticates with an `iotgw-ops` **user certificate**, not a raw key | Fetch/refresh a short-lived `iotgw-ops` cert in the runner pod (same place `fetch_kms_key.py` runs) and set `ansible_ssh_private_key_file` + `CertificateFile`. Retire the personal key | ANS / ING |
| `templates/autossh.j2` | `ssh -i /etc/dropbear/id_rsa … -R 2222:localhost:22 user@host` — a reverse-tunnel to a placeholder host, referencing a dropbear key path whose daemon `enable_ansible.sh` deletes | either a real, certificate-authenticated tunnel or removed | Audit + decide; currently dead/misconfigured | ANS |
| 12 × `tasks/*.yaml` using `key_file: /root/.ssh/id_rsa` | depend on the shared key existing on the gateway | unchanged in phase 1 | none until the shared key is retired; then re-point to a per-device key | ANS |
| `playbooks/i00_chage_inventory_ip.yaml` | error text tells the operator to *"add the AnsibleForms public key to authorized_keys"* | reflect the CA model | Reword; point at the enrollment runbook | ANS |
| `tasks/nodered.yaml` (`.sshkeys/admin_id_rsa`) | separate Node-RED project key | out of scope | none | — |

---

## D. Database & API layer (DB)

| Item | Current | Required | Change | Owner |
|---|---|---|---|---|
| `domains` | `id`, `name`, `display_name` | knows its `pki-manager` zone | **Migration**: `ALTER TABLE domains ADD COLUMN pki_zone text UNIQUE`, `pki_user_ca_id text`, `pki_host_ca_id text` — all nullable, all **references**, never key material | DB |
| `devices` | `ssh_key_id` (KMIP), WireGuard `private_key`/`public_key` | knows its enrollment state | **Migration**: `ssh_host_id text` (pki-manager host id), `ssh_host_fqdn text`, `ssh_host_key_fingerprint text`, `ssh_host_cert_serial text`, `ssh_host_cert_valid_before timestamptz`, `ssh_ca_enrolled_at timestamptz`. **No certificate body, no key material** | DB |
| `devices.ssh_key_id` / Cosmian KMS | per-device Ed25519 key minted on INSERT, fetched by the runner, but **never authorised on any gateway** | resolved, not left dangling | `decision-028` §7 — either repurpose as the gateway's *outbound* identity or retire | DB / ING |
| `device_jobs` / `deployment_jobs` | carry `ssh_key_id` | carry enrollment outcome | Add `ssh_ca_status`, `ssh_ca_error` to the job RPCs, or reuse a new `ssh_enrollment_jobs` table | DB |
| tRPC `devices` router | `checkSshKeyStatus`, `getDeviceSshPublicKey`, `generateMissingSshKey` | + certificate status | Add `getSshCertStatus` (from the new columns) and `enrollSshCa` (force re-enroll). Never return private material | ING |
| tRPC `domains` router | plain CRUD | creates/links the zone | On domain create: call `pki-manager` (OIDC service account) to create zone + User CA + Host CA + the two principals; persist the ids. Fail loudly, and make it re-runnable for existing domains | ING |
| Device delete path | destroys the KMS key | also decommissions the PKI host | Call `POST /api/v1/ssh/hosts/:id/offboard`. **Terminal** — see `decision-028` §10 | ING |
| UI `devices/$id.tsx`, `devices/index.tsx` | show SSH-key presence | show certificate status + expiry | New badge/column driven by `ssh_host_cert_valid_before` | ING |

---

## E. `pki-manager` (PKI)

These are changes **in the PKI repo**, not in `iotgw-ng`.

| Item | Current | Required | Change | Owner |
|---|---|---|---|---|
| `/ssh/zones/:zone/{trusted-user-ca-keys,host-ca-keys,cert-authority}` | **SPA-shadowed** — returns the frontend `index.html` (verified on `pki.joor.net`, 2026-09-14) | serve the zone-scoped trust material | Fix the SPA fallback so `/ssh/*` is excluded. Blocks any design where a host or operator self-fetches zone-scoped anchors | PKI |
| `oriolrius.pki_manager` Ansible collection | uses the **unscoped** (default-zone) endpoints | zone-aware | Pass `zone` through the module. Until then `iotgw-ng` must not rely on the collection for multi-zone work — one reason `tasks/ssh_ca.yaml` talks to the `ssh-ca` edge function instead | PKI |
| Zone provisioning API | present (`/api/v1/ssh/zones`) | unchanged | none | — |
| Fleet token scoping | per CA-pair + op-set | unchanged; we need `sign-host`, `register-host-pubkey`, `get-principals` | none | — |
| `krl-client` | Go static binary, x86-64 available | runs on OpenWRT x86-64 gateways | Verify musl/static compatibility on OpenWRT; package or vendor the binary | PKI / ANS |

> **DECISION (task-077, 2026-09-22): `iotgw-ng` does NOT use the
> `oriolrius.pki_manager` Ansible collection — deliberately, not pending a fix.**
> Two independent reasons, either sufficient:
> 1. **Wrong trust scope.** The collection drives the **unscoped** pki-manager
>    endpoints, which serve the **`default`** zone only. `iotgw-ng` is
>    one-zone-per-domain (`decision-024`), so the collection as published cannot
>    enroll a gateway into the correct trust domain.
> 2. **Token placement (the decisive one).** The collection would call
>    pki-manager **directly from the Ansible controller (the Kestra runner pod)**,
>    which means a zone-scoped **fleet token in the runner pod** — exactly what
>    `decision-024 §3` forbids. `tasks/ssh_ca.yaml` instead goes through the
>    **`ssh-ca` edge function**, authenticated by the **device TOTP**, so the
>    fleet token never leaves the edge function and enrollment reuses the device's
>    own credential.
>
> Therefore even a **zone-aware** version of the collection (option (a)) would not
> be adopted: it does not resolve the token-placement objection. Adoption would
> require an explicit reversal of `decision-024 §3` (fleet token in the pod) —
> **not** taken. This closes the "either/or" as **(b)**; do not "fix" this later
> by adopting the collection. (AC#1/#2.)
>
> **AC#3 — divergence recorded here** so `iotgw-ng`'s own docs explain why it does
> not take the path the collection's README implies; no change is required in the
> pki-manager repo for `iotgw-ng`'s sake (the collection remains valid for
> single-/default-zone consumers). Grep-confirmed 2026-09-22: no
> `oriolrius.pki_manager` reference exists anywhere in this workspace or the
> `iotgw-kestra` flows — the collection is genuinely unused.

---

## F. Operator / client trust distribution (OPS)

| Item | Current | Required | Change | Owner |
|---|---|---|---|---|
| Operator `known_hosts` | nothing, or per-host TOFU entries; `~/.ssh/config` has a `Host *` block with `StrictHostKeyChecking no` | per-domain `@cert-authority` lines | New `just ssh-trust` + `scripts/ssh-ca/trust.sh`: fetch each domain's Host CA, write `~/.ssh/known_hosts.d/iotgw-<domain>`, add a scoped `~/.ssh/config` block. Idempotent; never touches unrelated lines | OPS / ING |
| Operator user certs | none — raw keys in a GitHub profile | short-lived `iotgw-admin` certs | New `scripts/ssh-ca/user-cert.sh` wrapping `POST /api/v1/ssh/users/issue`; writes `~/.ssh/iotgw-<domain>-cert.pub` next to the key | OPS / ING |
| The `Host *` `StrictHostKeyChecking no` in `~/.ssh/config` | defeats host-cert verification for every host | scoped away from the `iotgw` namespace | Document; the new block for `*.iotgw` sets `StrictHostKeyChecking yes` explicitly (more specific keyword wins for `Host` blocks that appear first) | OPS |
| `github.com/sabatligats.keys` | the de-facto fleet ACL | not a trust root | Stop consuming it (see C/`enable_ansible.sh`); keep only as break-glass content vendored in-repo | OPS |

---

## G. Secrets & deployment (ING)

| Item | Current | Required | Change | Owner |
|---|---|---|---|---|
| `secrets/supabase.enc.env` | no PKI keys | `PKI_BASE_URL`, per-zone `PKI_FLEET_TOKEN_*` | Add via `just secrets-edit supabase`; re-render Secret; roll `deploy/functions` | ING |
| `secrets/iotgw-ui-backend.enc.env` | no PKI keys | OIDC service-account creds for `pki-manager` | Add `PKI_BASE_URL`, `PKI_TOKEN_URL`, `PKI_CLIENT_ID`, `PKI_CLIENT_SECRET` | ING |
| `tools/verify.sh` / `just verify` | secret hygiene, SOPS round-trip, kustomize, ui tests, kind smoke | + SSH-CA smoke | Add a check that the `ssh-ca` edge function answers and that a test device can enroll | ING |
| `deploy/k8s/base/supabase-app/functions` | — | reaches `pki.joor.net` | Confirm egress (no NetworkPolicy currently blocks it in `supabase-app`); add one if the namespace gains a default-deny | ING |

---

## H. What becomes obsolete once migration completes

Delete only after `decision-027` phase 5 verification passes:

| Artefact | Why obsolete |
|---|---|
| `files/credentials/id_rsa` + `id_rsa.pub` (both repos) | shared fleet private key replaced by per-device host keys + user certs |
| `tasks/system.yaml` "setting SSH pub/private key" tasks | same |
| `files/enable_ansible.sh` lines 24-28 (`wget … .keys`) | `authorized_keys` no longer the access mechanism |
| `keys/id_rsa` namespace file | runner uses an `iotgw-ops` certificate |
| `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null` in every inventory and `ProxyCommand` | host certs make verification possible |
| live-image `root/.ssh/id_ed25519{,.pub}` | no private key in an image |
| live-image `authorized_keys` entries beyond the named break-glass set | replaced by `TrustedUserCAKeys` |
| `templates/autossh.j2` (if confirmed dead) | references a deleted dropbear key path |

**Not obsolete, deliberately retained:** a minimal, named, audited break-glass
`authorized_keys` on gateways and in the live image — the explicit requirement,
and the thing that survives a KRL block (proven in `ssh-cert-test` §7).

## References

`decision-023` (baseline) · `decision-024` (architecture) · `decision-026`
(sequence) · `decision-027` (migration) · `decision-028` (open decisions)
</content>
