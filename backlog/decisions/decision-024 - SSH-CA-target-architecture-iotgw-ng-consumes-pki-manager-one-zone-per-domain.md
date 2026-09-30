---
id: decision-024
title: "024: SSH CA target architecture — iotgw-ng consumes pki-manager, one zone per domain"
date: '2026-09-14 07:40'
status: proposed
---
## Context

`decision-023` establishes that SSH access to `iotgw-ng` gateways rests on
statically distributed individual public keys, a fleet-wide shared private key,
and no host authentication at all. We want certificate-based SSH, with
`pki-manager` (production at `https://pki.joor.net`) as the **only** PKI.

`pki-manager` already implements everything we need — it is an OpenSSH CA whose
private keys live in a Cosmian KMS, with per-tenant **zones**
(`pki-manager` `decision-017`), fleet tokens, an external signing API, per-host
access blocks and an ECIES-encrypted per-host KRL distribution channel
(`pki-manager` `decision-013`/`-015`/`-016`). The `ssh-cert-test` lab proves the
whole chain end to end against the live instance.

Verified against `pki.joor.net` on 2026-09-14:

- `GET /api/v1/ssh/zones` → one zone, `default`.
- `GET /api/v1/ssh/cas` → exactly one `active` User CA (`acme-users`) and one
  `active` Host CA (`acme-hosts`), both `zoneId: default`, ECDSA-P256.
- `GET /api/v1/ssh/principals` → `admins`, `users` (zone `default`).
- The **unscoped** public trust routes work
  (`/ssh/trusted-user-ca-keys`, `/ssh/host-ca-keys`, `/ssh/cert-authority`)…
- …but the **zone-scoped** ones (`/ssh/zones/:zone/…`) are **SPA-shadowed** on
  this deployment and return the frontend's `index.html`. This is a
  `pki-manager`-owned defect and it directly shapes the design below.

## Decision

### 1. Responsibility boundary

> **`iotgw-ng` implements no PKI.** It stores no CA key, signs nothing, issues
> nothing, revokes nothing, and keeps no certificate state that `pki-manager`
> does not already own. It is a **broker and a distribution channel**.

| Concern | Owner |
|---|---|
| CA key generation, storage, signing | **pki-manager** (keys in Cosmian KMS; never exported) |
| Zones, CA rotation, serial allocation | **pki-manager** |
| Host + user certificate issuance | **pki-manager** |
| Principals and their host/account mapping | **pki-manager** |
| Revocation: KRL composition, per-host blocks, offboarding | **pki-manager** |
| Trust anchors (`TrustedUserCAKeys`, `@cert-authority`) as *content* | **pki-manager** |
| Knowing *which* gateway belongs to *which* trust domain | **iotgw-ng** (`domains` → zone) |
| Authenticating a gateway well enough to enroll it | **iotgw-ng** (device TOTP, `decision-009`) |
| Getting trust material *onto* a gateway | **iotgw-ng** (edge function + Ansible) |
| Operator/client-side trust rollout | **iotgw-ng** (tooling), **pki-manager** (content) |

### 2. `iotgw-ng` domain ⇔ `pki-manager` zone (1 : 1)

A `pki-manager` zone is a **real trust boundary**: a host in zone Z trusts only
Z's user CAs, and its KRL, `TrustedUserCAKeys` and `@cert-authority` lines all
derive from Z. Cardinality is **one `active` + one `rotating` CA per
`(zone, ca_type)`** — i.e. exactly one User CA and one Host CA per zone. That is
precisely the requested "one CA pair per space, one host CA per domain, never
shared across domains".

```
iotgw-ng                                  pki-manager
──────────                                ───────────
domains.name = "acme"       ──1:1──▶      zone slug "iotgw-acme"
  └─ networks                                ├─ User CA  (active)   ← signs operators
       └─ devices  ────────register────▶     ├─ Host CA  (active)   ← signs gateways + KRLs
                                             ├─ principals: iotgw-admin, iotgw-ops
                                             └─ hosts: <device fqdn>
```

- **Zone slug**: `iotgw-<domains.name>` (URL-safe slug; the prefix keeps the
  `iotgw-ng` fleet distinguishable from other tenants of the same PKI). The
  mapping is stored in `iotgw-ng`, not inferred — see `decision-025`
  (`domains.pki_zone`).
- A domain **without** a zone cannot enroll gateways. Enrollment fails closed.
- Zone membership is **immutable** in `pki-manager` (offboard + re-enroll to
  move). Therefore moving a device between domains is an offboard + re-enroll in
  `iotgw-ng` too.

### 3. Gateways never talk to `pki-manager`

All gateway ↔ PKI traffic is brokered by an `iotgw-ng` **edge function**
(`ssh-ca`). Four reasons, in order of weight:

1. **The fleet token must not reach a device.** A `pkimg_…` token scoped to
   `sign-host` would let any compromised gateway mint a host certificate for
   *any* FQDN in the zone. Brokering keeps the token server-side, and lets
   `iotgw-ng` bind the signing request to the device row that authenticated.
2. **We already have a device-authenticated channel.** The device proves
   possession of the TOTP derived from `domain-network-device-counter`
   (`decision-009`) to fetch its WireGuard config. Reusing it gives enrollment a
   bootstrap trust anchor for free, and satisfies the requirement that "in the
   process of getting WireGuard configuration we also install the SSH user and
   host CAs".
3. **Zone-scoped public trust endpoints are broken on the live deployment**
   (SPA-shadowed, verified above). A gateway cannot fetch its own zone's anchors
   anonymously today. The broker reads them over the authenticated API instead.
4. **Egress.** A gateway's default route goes into WireGuard; reaching
   `pki.joor.net` directly would be a new egress dependency on a device we are
   trying to harden.

The single exception is the **KRL pull** (`POST /api/v1/external/ssh/krl`),
which is unauthenticated by design because ECIES means only the target host can
decrypt the answer. Whether gateways pull it directly or via the broker is
`decision-028` §6.

```
   gateway (OpenWRT)                iotgw-ng                        pki-manager
   ─────────────────                ────────                        ───────────
   ssh-keygen (on device)
   host privkey NEVER leaves
        │  TOTP-encrypted POST
        │  { device_id, host_pubkey }
        ├───────────────────────▶  edge fn `ssh-ca`
        │                           • verify TOTP (decision-009)
        │                           • resolve device→network→domain→zone
        │                           • derive fqdn + principals
        │                                     │ Bearer pkimg_… (per-zone)
        │                                     ├──────────────────▶ POST /api/v1/external/ssh/sign-host
        │                                     │                     (+ Idempotency-Key)
        │                                     ◀──────────────────  { certOpenssh, serial, validBefore }
        │                                     │ OIDC (read-only)
        │                                     ├──────────────────▶ GET /api/v1/ssh/trust-anchors?zone
        │                                     ◀──────────────────  { userCaKeys[], hostCaKeys[] }
        │  TOTP-encrypted response
        ◀───────────────────────  { host_cert, user_ca, host_ca, sshd_dropin, auth_principals }
   install + `sshd -t` + reload
```

**No CA private key, and no fleet token, ever crosses into the gateway.** The
gateway's host private key never crosses *out*.

### 4. Host CA lifecycle and signing flow

| Step | Where | What |
|---|---|---|
| Host key generation | **on the gateway**, first provisioning | `ssh-keygen -t ecdsa -b 256 -f /etc/ssh/ssh_host_ecdsa_key -N ""` if absent. Unique per device; private half never leaves. |
| Why ECDSA-P256 | — | `pki-manager`'s ECIES KRL channel is **P-256 only**; an ed25519-only host gets `404 ECIES_KEY_UNSUPPORTED`. Using an ecdsa host key keeps the encrypted per-host KRL and per-host access blocks available. ed25519 host keys stay present but uncertified. |
| CSR | gateway → `ssh-ca` edge fn → `POST /api/v1/external/ssh/sign-host` | body carries only `fqdn`, `addresses`, `opensshHostPubkey`. `Idempotency-Key: <deviceId>-<pubkey-fingerprint>` so retries do not burn serials. |
| Signing | **pki-manager**, Host CA of the device's zone | serial + `keyId` + `validBefore` returned. |
| Install | gateway | `/etc/ssh/ssh_host_ecdsa_key-cert.pub` (0444), `HostCertificate` in the drop-in. |
| Renewal | gateway, unattended | re-enroll when remaining life < ⅓ of the validity window (`decision-028` §1). Re-enrollment is the same call — idempotent, no new key needed. |
| Rotation of the CA itself | pki-manager (`active` → `rotating`) | both anchors are published during the overlap; gateways get the union in `ssh-host-ca.pub` / `@cert-authority`. |
| Decommission | pki-manager `offboard-host` | revokes its certs, retires its KRL lineage, `/krl` then 404s. Terminal. Driven from `iotgw-ng` on device delete. |

**Host certificate principals** — a host cert's principals are the names a
client may use to reach it. We issue three:

```
<device>.<network>.<domain>.iotgw     ← canonical fqdn, the registered name
<device>.<domain>.iotgw               ← short form
<wireguard ip>                        ← the address operators actually dial
```

The `.iotgw` suffix is a private, non-resolvable namespace; clients pin it with
`HostKeyAlias` exactly as the existing `~/.ssh/config` entry for
`ovh-ymbihq-node` already does. Rationale and alternatives: `decision-028` §2.

### 5. User CA lifecycle and signing flow

| Step | Where | What |
|---|---|---|
| Identity | pki-manager, per zone | one `ssh_identities` row per operator **per domain** (zones are a hard partition — one person in three domains needs three identities). |
| Key | operator workstation | the operator's existing key; only the public half is sent. |
| Issuance | pki-manager `POST /api/v1/ssh/users/issue` (OIDC) or `/api/v1/external/ssh/sign-user` (token) | short TTL (`decision-028` §1). |
| Trust on the gateway | `TrustedUserCAKeys /etc/ssh/ssh-user-ca.pub` | the zone's User CA public key(s), delivered by the `ssh-ca` edge fn. |
| Authorisation | `AuthorizedPrincipalsFile /etc/ssh/auth_principals/%u` | the principal must appear **both** in the cert and in the file for the account — the classic two-places rule. |
| Revocation | short TTL (primary) + KRL + per-host blocks (immediate) | `decision-028` §6. |

**Principals.** Two per zone, mapped on every gateway to the only account that
exists on OpenWRT (`root`):

| Principal | `auth_principals/root` | Meaning |
|---|---|---|
| `iotgw-admin` | yes | full interactive administration of gateways in this domain |
| `iotgw-ops` | yes | automation (the Kestra runner identity) |

They are separate so that automation can be blocked or re-scoped without
touching humans, and so that `ForceCommand`/`source-address` restrictions can
later be attached to `iotgw-ops` alone.

### 6. Operator/client-side trust distribution

Operators must stop pinning per-gateway host fingerprints. The Host CA is
distributed as a `known_hosts` `@cert-authority` line, one per domain:

```
@cert-authority *.acme.iotgw,10.121.*.* ecdsa-sha2-nistp256 AAAA… iotgw-acme-hosts
```

- Content comes from `pki-manager` (`GET /ssh/cert-authority?pattern=…`, or the
  zone-scoped route once un-shadowed).
- Distribution is an `iotgw-ng` responsibility: a `just ssh-trust` recipe writes
  the per-domain `@cert-authority` lines into `~/.ssh/known_hosts.d/iotgw-<domain>`
  and an `~/.ssh/config` include, and drops the operator's user certificate next
  to their key. It is idempotent and never rewrites unrelated `known_hosts` lines.
- The same anchors are what the **Kestra runner pod** must use: its inventories
  lose `StrictHostKeyChecking=no` and gain a generated `known_hosts` with the
  zone's `@cert-authority` line. That is the single change that closes R3.

### 7. What lands where

| Material | Live image | Gateway (provisioned) | Operator | Kestra runner |
|---|---|---|---|---|
| User CA **public** key | ✅ (all zones) | ✅ (own zone) | — | — |
| Host CA **public** key | — | ✅ (own zone, for KRL sig verification) | ✅ `@cert-authority` | ✅ `@cert-authority` |
| Own host **private** key | generated per boot | generated on device, never leaves | — | — |
| Own host **certificate** | ✳ short-lived, optional (`decision-028` §5) | ✅ | — | — |
| User **certificate** | — | — | ✅ short TTL | ✅ short TTL (`iotgw-ops`) |
| CA **private** key | ❌ never | ❌ never | ❌ never | ❌ never |
| Fleet token `pkimg_…` | ❌ never | ❌ never | ❌ never | ❌ never (edge fn only) |
| KRL (`revoked_keys`) | — | ✅ pulled | — | — |

The live image therefore carries **public trust material only**: the User CA
anchors so that operators and the runner can log into the live environment with
a certificate instead of the three hardcoded keys. The static `id_ed25519`
private key is removed.

### 8. Authentication between `iotgw-ng` and `pki-manager`

Two distinct credentials, both SOPS-encrypted in `secrets/` (`decision-014`),
never in tracked source:

| Credential | Holder | Scope | Used for |
|---|---|---|---|
| **Fleet token** `pkimg_…`, one per zone | `ssh-ca` edge function | `sign-host`, `register-host-pubkey`, `get-principals`, bound to that zone's Host CA | gateway enrollment |
| **OIDC service account** (Keycloak `pki-manager` realm) | `iotgw-ui` backend | admin-tier | creating a zone + CA pair + principals when a domain is created; reading trust anchors; `offboard-host` on device delete; `block`/`unblock` |

The edge function deliberately gets the *weaker* credential: it is reachable
from the device network, so it must not be able to create CAs, issue user certs
or offboard hosts. Exact scoping of the OIDC service account is `decision-028` §9.

## Consequences

### Positive

- One PKI, already in production, already audited, already tested end-to-end by
  `ssh-cert-test`. No second implementation, no second CA key custody problem.
- Revoking an operator becomes a TTL expiry or one `block` call, not a fleet-wide
  Ansible run.
- Gateways get real identities; `StrictHostKeyChecking=no` can finally go.
- Per-domain trust partitioning falls out of `pki-manager` zones for free — a
  compromised domain's Host CA cannot impersonate another domain's gateway.
- The shared fleet-wide private key (R1) and the public-internet trust root (R2)
  disappear.

### Negative / costs

- **A new runtime dependency on `pki.joor.net`** for enrollment and renewal.
  Mitigated by long host-cert TTLs and last-good behaviour (`decision-028` §8).
- **Clock dependency.** Certificates are time-bound; chrony is already deployed
  by `tasks/chrony.yaml`, but the live image's clock must be checked too.
- **Two `pki-manager` defects must be fixed** before multi-zone rollout: the
  SPA-shadowed `/ssh/zones/:zone/*` routes, and the Ansible collection's
  hard-coded use of unscoped (default-zone) endpoints.
- **Operator friction**: certificates expire; operators need a renewal habit and
  a tool. Break-glass `authorized_keys` stays as the safety net.
- Zone-per-domain means an operator working across N domains needs N identities
  and N certificates. Accepted as the price of a hard boundary.

## References

- `decision-023` — current-state baseline
- `decision-025` — change map, `decision-026` — provisioning sequence,
  `decision-027` — migration, `decision-028` — open decisions
- `pki-manager` `decision-017` (zones), `-016` (per-host blocks), `-015` (KRL
  client decryption), `-013` (KRL distribution), `-011` (SSH signing approach)
- `pki-manager` `docs/ssh/{concept,setup,zones,principals-guide}.md`,
  `docs/ssh-api-contract.md`
- `ssh-cert-test` — the validated PoC this architecture mirrors
</content>
