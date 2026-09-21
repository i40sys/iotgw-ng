# SSH-CA operator runbook

How an operator gets certificate-based SSH access to iotgw-ng gateways, and what
to do when a certificate expires. Certificate access replaces per-host
`authorized_keys` entries (`decision-024`/`decision-027`); a break-glass raw-key
path is kept **alongside** during the migration, never as the primary mechanism.

Access is **per domain** — one pki-manager **zone** per iotgw-ng domain
(`warehouse`, `production`, `office`, …). You trust a domain's **Host CA** once
(to verify gateways) and carry a short-lived **user certificate** (to log in).

## 1. Trust a domain's Host CA (verify gateways, no per-host `known_hosts`)

```bash
scripts/ssh-ca/trust.sh                 # every domain that has a pki zone
scripts/ssh-ca/trust.sh warehouse       # one domain
```

Writes `~/.ssh/known_hosts.d/iotgw-<domain>` with an `@cert-authority *.<domain>.iotgw`
line and a `~/.ssh/config.d/iotgw-ca.conf` `Host *.iotgw` block
(`StrictHostKeyChecking yes`, prepended so a catch-all `Host * StrictHostKeyChecking no`
can't defeat it). After this, connecting by a **certified name** produces no
host-key prompt and adds no `known_hosts` entry:

```bash
ssh -o HostKeyAlias=<device>.<domain>.iotgw root@<gateway-ip>
ssh -G <device>.<domain>.iotgw | grep -E 'stricthostkeychecking|userknownhostsfile'
```

Source of the trust lines is the **public, zone-scoped** pki route
`/ssh/zones/<zone>/cert-authority?pattern=*.<domain>.iotgw` (no credential — a CA
public key is public). It returns one `@cert-authority` line **per Host CA**, so a
Host CA mid-rotation (active + rotating) is trusted for the whole overlap window
(decision-028 §4) — the older id-addressed `/ssh/cas/<id>/ca.pub` route returned a
single CA. The `<domain> → zone` map comes from `domains.pki_zone` in the cluster
DB, or pass `DOMAIN_ZONE_MAP="<domain>=<zone>,…"` on a workstation with no cluster
access.

## 2. Get a user certificate (log in as `iotgw-admin`)

```bash
PKI_TOKEN=<your-oidc-jwt> PKI_SUBJECT=<you@example> scripts/ssh-ca/user-cert.sh warehouse
# or, with a token command:
PKI_TOKEN_CMD='my-oidc-login --print-token' scripts/ssh-ca/user-cert.sh warehouse
```

Signs your existing SSH **public** key (`~/.ssh/id_ed25519.pub` by default; override
`IDENTITY_FILE`) and drops the cert next to your key as `<IdentityFile>-cert.pub`,
which OpenSSH picks up automatically. Your **private key never leaves your machine**
and no per-host `authorized_keys` entry is created.

- **Auth is your OWN OIDC JWT** — log in to `pki.joor.net` and pass it via
  `PKI_TOKEN`. The iotgw-ng fleet token deliberately **cannot** sign user certs
  (`decision-028 §9`); only the `ssh-ca` edge function signs *host* certs.
- TTL is short: **24 h** for `iotgw-admin` (`decision-028 §1`). `iotgw-ops` (2 h)
  is minted by the backend for automation, never by hand.

## 3. Renew an expired certificate

- **Your user certificate** — re-run the exact same command as step 2. It replaces
  the expired cert with **no new key**. There is nothing else to rotate.
- **A gateway's host certificate** — 90-day lifetime, renewed by re-running the
  enrollment (`tasks/ssh_ca.yaml`, idempotent: it re-enrolls only when the cert is
  missing/mismatched or within its renewal margin, ~30 d). Automatic gateway-side
  renewal-before-expiry is `task-104`.

## 3b. Rotate a CA and prove the fleet re-issued before retiring the old one

CA rotation is **event-driven** (compromise / policy), never scheduled, with a
**≥120-day overlap** (> the 90-day host-cert TTL) and retirement **gated** on a
fleet re-issue report (`decision-028 §4`). During the overlap pki-manager
publishes both the `active` successor and the `rotating` predecessor, so
gateways and operators keep trusting either (the zone-scoped routes deliver the
pair — see step 1).

Before you **retire** the old (rotating) CA, prove nothing live still depends on
it — retiring a CA invalidates everything it signed:

```bash
PKI_TOKEN=<your-oidc-jwt> scripts/ssh-ca/fleet-report.sh                 # every rotating CA
PKI_TOKEN=<your-oidc-jwt> scripts/ssh-ca/fleet-report.sh warehouse       # one domain's zone
```

It calls pki-manager's `GET /api/v1/ssh/cas/:caId/reissue-report` for each
rotating CA and prints, per CA, how many live certs are **still under it** (the
devices that have **not** re-issued) and a **SAFE TO RETIRE: YES/NO** verdict.
It exits non-zero (2) while any device is still on an old CA, so it doubles as a
gate in automation. Only once it reports safe do you retire the predecessor
(`POST /api/v1/ssh/cas/:caId/retire`).

## 4. Break-glass (raw key still works)

Enrollment installs two sshd drop-ins on the gateway: `50-iotgw-authorized-keys.conf`
(break-glass) sorts **before** `60-iotgw-ssh-ca.conf` (CA), so an
`~/.ssh/authorized_keys` entry keeps working even after enrollment
(`decision-028 §11`). Use it if the certificate path is unavailable (expired CA
trust, pki-manager down). It is a fallback, not the default — the migration's goal
is that certificates, not raw keys, are how you get in.

## What runs where

| Piece | Who | Auth |
|---|---|---|
| `trust.sh` (Host CA → known_hosts) | operator workstation | none (public CA route) |
| `user-cert.sh` (issue user cert) | operator workstation | operator's OIDC JWT |
| `fleet-report.sh` (CA retirement gate) | operator workstation | operator's OIDC JWT |
| `tasks/ssh_ca.yaml` (gateway enroll) | Ansible via Kestra `install` / standalone | device TOTP → `ssh-ca` edge fn |
| domain zone + CAs + principals | iotgw-ui backend `services/pki.ts` | Keycloak service account (`PKI_OIDC_*`) |
| host-cert signing | `ssh-ca` edge function | zone-scoped fleet token (`PKI_FLEET_TOKENS`) |

See `backlog/decisions/decision-023..028` for the full design, and the root
[`CLAUDE.md`](../../CLAUDE.md) → "The SSH-CA Access Path" for the call chain.
