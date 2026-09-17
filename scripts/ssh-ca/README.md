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

Source of the Host CA is the **public, id-addressed** pki route
`/ssh/cas/<id>/ca.pub` (no credential — a CA public key is public). The
`<domain> → host-CA-id` map comes from `domains.pki_host_ca_id` in the cluster DB,
or pass `DOMAIN_CA_MAP="<domain>=<hostCaId>,…"` on a workstation with no cluster
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
| `tasks/ssh_ca.yaml` (gateway enroll) | Ansible via Kestra `install` / standalone | device TOTP → `ssh-ca` edge fn |
| domain zone + CAs + principals | iotgw-ui backend `services/pki.ts` | Keycloak service account (`PKI_OIDC_*`) |
| host-cert signing | `ssh-ca` edge function | zone-scoped fleet token (`PKI_FLEET_TOKENS`) |

See `backlog/decisions/decision-023..028` for the full design, and the root
[`CLAUDE.md`](../../CLAUDE.md) → "The SSH-CA Access Path" for the call chain.
