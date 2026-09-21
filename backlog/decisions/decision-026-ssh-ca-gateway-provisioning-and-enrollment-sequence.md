---
id: decision-026
title: "026: SSH CA gateway provisioning and enrollment sequence"
date: '2026-09-14 08:00'
status: proposed
---
## Context

`decision-024` fixes the architecture; this ADR fixes the **sequence** — every
step of bringing a gateway from PXE boot to certificate-authenticated SSH, who
performs each step, and what data crosses each trust boundary.

Three trust boundaries matter:

- **B1** live/gateway ↔ `iotgw-ng` (Supabase edge functions) — authenticated by
  the device TOTP (`decision-009`).
- **B2** `iotgw-ng` ↔ `pki-manager` — authenticated by a per-zone fleet token
  (edge function) or an OIDC service account (backend).
- **B3** operator ↔ gateway — authenticated in both directions by certificates.

The invariant across all of them: **a private key never crosses a boundary.**

---

## Phase 0 — domain onboarding (once per domain, before any gateway)

| # | Actor | Step | Crosses |
|---|---|---|---|
| 0.1 | operator / `iotgw-ui` | create domain `acme` | — |
| 0.2 | `iotgw-ui` backend | `POST /api/v1/ssh/zones` `{name:"iotgw-acme"}` (OIDC) | B2: zone slug only |
| 0.3 | backend | `POST /api/v1/ssh/cas` ×2 (`caType: user`, `caType: host`, `zone: iotgw-acme`) | B2: no key material — `pki-manager` generates both CA keys **inside Cosmian KMS** |
| 0.4 | backend | `POST /api/v1/ssh/principals` ×2 → `iotgw-admin`, `iotgw-ops` | B2 |
| 0.5 | backend | persist `domains.pki_zone`, `pki_user_ca_id`, `pki_host_ca_id` | — |
| 0.6 | operator | mint a fleet token scoped to this zone's **Host CA** with op-set `sign-host, register-host-pubkey, get-principals`; store in `secrets/supabase.enc.env`; roll `deploy/functions` | B2 (plaintext shown once) |
| 0.7 | operator | `just ssh-trust` → `@cert-authority` line for `*.acme.iotgw` into `~/.ssh/known_hosts.d/iotgw-acme` | B3 (public key only) |

Fails closed: a domain with no `pki_zone` cannot enroll a gateway.

---

## Phase 1 — live boot (PXE)

| # | Actor | Step | Notes |
|---|---|---|---|
| 1.1 | gateway | PXE → `netboot.joor.net` → `menu.ipxe` → Clonezilla squashfs | unchanged |
| 1.2 | live image | `sshd` starts; **host keys generated fresh for this boot** | no persistent host identity |
| 1.3 | live image | `/etc/ssh/sshd_config.d/60-iotgw-ssh-ca.conf` makes it trust **every** `iotgw-ng` zone's User CA; `50-iotgw-authorized-keys.conf` keeps break-glass | public trust material only |
| 1.4 | Kestra runner | connects with an `iotgw-ops` **user certificate** (was: a personal raw key) | B3 user direction now certificate-based |
| 1.5 | — | **host direction is still TOFU in this phase** — the live image has no stable identity | `decision-028` §5 |

Data crossing B1 in this phase: **none**. The live phase needs no PKI call.

---

## Phase 2 — OS install (`d01_install_owrt.yml`)

| # | Actor | Step |
|---|---|---|
| 2.1 | Ansible → live machine | partition, copy OpenWRT rootfs, GRUB, fstab |
| 2.2 | `enable_ansible.sh` (chroot into the target rootfs) | install `openssh-server`; ensure `Include /etc/ssh/sshd_config.d/*.conf` exists in OpenWRT's `sshd_config`; write `/etc/ssh/ssh-user-ca.pub` (this domain's User CA), `/etc/ssh/auth_principals/root`, `/etc/ssh/sshd_config.d/60-iotgw-ssh-ca.conf`; write the **vendored** break-glass `authorized_keys` (no `wget` to GitHub) |
| 2.3 | `setup_vpn.sh` | WireGuard config into `/etc/config/network` — unchanged |
| 2.4 | — | reboot into OpenWRT |

After this phase the gateway **already accepts `iotgw-admin` certificates**,
even if provisioning never runs. It does not yet present a host certificate.

Data crossing B1: none (the User CA anchor was staged into the runner by the
`ssh-ca` edge function's `trust` route at flow start, or shipped as a namespace
file rendered from it).

---

## Phase 3 — enrollment (`tasks/ssh_ca.yaml`, first provisioning run)

This is the heart of the design.

```
 gateway (OpenWRT)                    ssh-ca edge fn                  pki-manager
 ─────────────────                    ──────────────                  ───────────
 3.1 ssh-keygen -t ecdsa
     /etc/ssh/ssh_host_ecdsa_key
     (only if absent; 0600)
     ── private half never leaves ──
 3.2 read .pub + build TOTP
     from domain-network-device-counter
 3.3 POST /functions/v1/ssh-ca?device_id=<name>@<netprefix>
     body = AES-256-CBC(TOTP){ device_id, host_pubkey, addresses }
     ─────────────────────────────▶  3.4 decrypt with each of the 3
                                        valid TOTP codes  ⇒ device authenticated
                                     3.5 resolve device → network → domain
                                        → domains.pki_zone  (fail closed)
                                     3.6 derive fqdn + principals:
                                        <device>.<network>.<domain>.iotgw
                                        <device>.<domain>.iotgw
                                        <wireguard ip>
                                     3.7 POST /api/v1/external/ssh/sign-host
                                        Bearer pkimg_…(zone)
                                        Idempotency-Key: <deviceId>-<fp>
                                        { fqdn, addresses, opensshHostPubkey }
                                        ──────────────────────────────▶ 3.8 Host CA signs
                                        ◀────────────────────────────── { hostId, certOpenssh,
                                                                          serial, validBefore }
                                     3.9 GET trust anchors for the zone
                                        ◀────────────────────────────── userCaKeys[], hostCaKeys[]
                                     3.10 write back devices.ssh_host_id,
                                          fingerprint, serial, valid_before
     ◀─────────────────────────────  3.11 AES-256-CBC(TOTP){ host_cert, user_ca,
                                          host_ca, auth_principals, sshd_dropin }
 3.12 install, atomically:
      /etc/ssh/ssh_host_ecdsa_key-cert.pub   0444
      /etc/ssh/ssh-user-ca.pub               0444
      /etc/ssh/ssh-host-ca.pub               0444   (KRL signature verification)
      /etc/ssh/auth_principals/root          0644
      /etc/ssh/revoked_keys                  0444   (empty if none yet)
      /etc/ssh/sshd_config.d/60-iotgw-ssh-ca.conf
      /etc/ssh/sshd_config.d/50-iotgw-authorized-keys.conf   (break-glass)
 3.13 sshd -t          ← MUST pass, else abort and roll back the drop-ins
 3.14 /etc/init.d/sshd reload   ← reload, never restart
 3.15 verify from the runner: ssh-keygen -L -f the cert; a cert login succeeds
```

The resulting drop-in (content produced by `pki-manager`'s `issued.sshdConfig`,
adjusted to the ecdsa key paths):

```
HostKey /etc/ssh/ssh_host_ecdsa_key
HostCertificate /etc/ssh/ssh_host_ecdsa_key-cert.pub
TrustedUserCAKeys /etc/ssh/ssh-user-ca.pub
AuthorizedPrincipalsFile /etc/ssh/auth_principals/%u
RevokedKeys /etc/ssh/revoked_keys
PubkeyAuthentication yes
```

and the break-glass drop-in, deliberately sorted **before** it so its
`AuthorizedKeysFile` wins (single-valued directives are first-value-wins):

```
# 50-iotgw-authorized-keys.conf
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
```

### What crosses which boundary

| Boundary | Direction | Payload | Sensitive? |
|---|---|---|---|
| B1 | gateway → iotgw-ng | device id, **host public key**, addresses, TOTP proof | no private material |
| B1 | iotgw-ng → gateway | host **certificate**, User CA **public** key, Host CA **public** key, principals file, sshd drop-in | all public trust material; encrypted in transit with the device TOTP on top of TLS |
| B2 | iotgw-ng → pki-manager | fqdn, addresses, host **public** key, fleet token | token is the only secret; never leaves the cluster |
| B2 | pki-manager → iotgw-ng | certificate, serial, validity, CA public keys | public |
| B3 | operator ↔ gateway | user certificate ↔ host certificate | public certs; both private keys stay put |

**Never crosses anything:** either CA private key (they never leave the Cosmian
KMS behind `pki-manager`), the gateway host private key, the operator private
key, the fleet token.

---

## Phase 4 — registration with `iotgw-ng`

Step 3.10 above. `devices` gains `ssh_host_id`, `ssh_host_fqdn`,
`ssh_host_key_fingerprint`, `ssh_host_cert_serial`,
`ssh_host_cert_valid_before`, `ssh_ca_enrolled_at`. The UI renders certificate
status and expiry alongside the existing SSH-key badge. No certificate body and
no key material is stored in Postgres — `pki-manager` remains the record of
truth; `iotgw-ng` stores references only.

---

## Phase 5 — renewal and rotation

| What | Trigger | Mechanism |
|---|---|---|
| **Host certificate renewal** | remaining life < ⅓ of the window | **controller-driven** (task-104, amends the original on-gateway cron): a scheduled Kestra flow (`ssh-ca-renewal`) walks the `devices` with a linked `pki_zone` and re-runs `tasks/ssh_ca.yaml --tags ssh_ca` per gateway; that task's on-gateway idempotence check re-signs only when remaining life < `ssh_ca_renew_margin_seconds` (30 d), with the **same** host key (re-sign, not re-key). `sshd -t` + `reload` again. See the identifier/credential note below. |
| **Host key rotation** | on demand / compromise | delete `ssh_host_ecdsa_key*`, re-enroll — a new key, a new cert, the old cert's serial goes into the KRL. |
| **User certificate renewal** | expiry (short TTL) | operator re-runs `scripts/ssh-ca/user-cert.sh`; the runner re-mints its `iotgw-ops` cert at the start of every flow. No new key needed. |
| **CA rotation** | `pki-manager` operation | the new CA becomes `rotating` alongside `active`; both anchors are published; gateways pick up the union at their next enrollment/renewal; after every host has re-issued, the old CA is retired. Overlap must exceed the host-cert TTL. |
| **KRL refresh** | every ~15 min | `krl-client` pulls the ECIES-encrypted composed per-host KRL, verifies the Host-CA signature, installs `/etc/ssh/revoked_keys` atomically. `sshd` re-reads it on every publickey auth — **no reload needed**. |
| **Decommission** | device delete in `iotgw-ng` | backend calls `offboard-host`; certs revoked, KRL lineage retired, `/krl` 404s (`krl-client` exit 9, keeps last-good). Terminal — see `decision-028` §10. |

> **Renewal identifier/credential model (task-104, reconciled with `decision-028`
> §12).** Renewal was originally specified as an on-gateway `cron`/`procd` timer.
> That is **not** how it is implemented: renewal is **controller-driven** because
> the on-gateway path would need `openssl`+`curl` (absent on OpenWRT), direct
> gateway→Kong reachability, and the device's TOTP secret **stored on the device**
> — the last being exactly the weak-binding problem §12/task-075 is still open on.
> The controller path avoids all three: the scheduled Kestra flow reaches each
> gateway over the runner's existing access, and the enrollment call derives the
> device TOTP **on the controller** from the identifiers the backend already holds
> (`<domain_id>-<network_id>-<device_uuid>-<totp_counter>`; `decision-009`,
> `_shared/device-auth.ts`). So renewal introduces **no new on-device authenticator
> and no new credential** — it reuses the same TOTP-from-identifiers channel as
> enrollment and therefore *inherits* §12's identifier-strength caveat without
> widening it. An expired host cert (offline gateway) degrades host verification
> only, never login (`decision-028` §8); the next daily run re-signs on contact.

---

## Phase 6 — migrating an already-deployed gateway

Identical to phase 3, with the entry path being the existing `authorized_keys`
access instead of a fresh install:

1. Reach the gateway over the current shared/individual key (still present).
2. Run `tasks/ssh_ca.yaml` with `--tags ssh_ca` — it is standalone and
   idempotent; it touches nothing outside `/etc/ssh`.
3. `sshd -t` gate, then `reload`. The existing session is **not** dropped by a
   reload, and the break-glass drop-in keeps `authorized_keys` working, so a
   failed enrollment cannot lock anyone out.
4. Verify certificate login from a second, independent session **before**
   considering the gateway migrated.

Gateways that are offline at migration time enroll on their next provisioning
run; `devices.ssh_ca_enrolled_at IS NULL` is the work queue.

---

## Failure modes and their handling

| Failure | Behaviour |
|---|---|
| `pki-manager` unreachable during enrollment | task fails; **nothing is written**; gateway keeps working on `authorized_keys`. Retry later. |
| `sshd -t` fails | drop-ins removed, no reload, task fails loudly. sshd keeps its running config. |
| TOTP window mismatch (clock drift) | edge fn returns 401 after trying ±1 window; chrony must be healthy. The live image's clock is checked before install. |
| Certificate expired, gateway offline past renewal | host cert expiry breaks *host* verification for clients, not login; user certs still work. Break-glass `authorized_keys` remains. `decision-028` §8. |
| Fleet token leaked | rotate it; it can only `sign-host` within one zone and cannot issue user certs or offboard. |
| Device deleted but gateway still running | `offboard-host` revokes its certs; the gateway is unreachable by cert but still reachable by break-glass until wiped. |

## References

`decision-023`/`-024`/`-025`/`-027`/`-028` · `decision-009` (device TOTP) ·
`pki-manager` `docs/ssh-api-contract.md`, `docs/ssh/setup.md` ·
`ssh-cert-test` `provision.sh` (the reference implementation of steps 3.1-3.15)
</content>
