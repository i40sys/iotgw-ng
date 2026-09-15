---
id: decision-027
title: "027: SSH CA migration plan — authorized_keys to certificate coexistence and cutover"
date: '2026-09-14 08:10'
status: proposed
---
## Context

The fleet is reachable today **only** through `authorized_keys` entries and one
shared private key (`decision-023`). Any migration that removes them before
certificate access is proven locks us out of production hardware — some of it
behind a WireGuard tunnel with no console.

The governing principle: **certificate authentication is added alongside
`authorized_keys`, never instead of it, until certificate access has been
independently verified on that specific gateway.**

This is safe because certificate auth and a raw `authorized_keys` key are both
the `publickey` method — `sshd` accepts either, simultaneously. `ssh-cert-test`
proves this in production: a break-glass raw key keeps working even when the
certificate holder is actively blocked by the KRL (that lab's TEST B).

---

## Phase 0 — preparation (no gateway is touched)

| Step | Verification |
|---|---|
| Fix `pki-manager`'s SPA-shadowed `/ssh/zones/:zone/*` routes | `curl /ssh/zones/<z>/host-ca-keys` returns a key, not HTML |
| Create a **pilot zone** (`iotgw-lab`) + CA pair + principals on `pki.joor.net` | `GET /api/v1/ssh/zones` lists it; `GET /api/v1/ssh/cas` shows one active user + one active host CA in it |
| Mint the pilot fleet token; store in `secrets/supabase.enc.env` | `just secrets-check` passes; no plaintext in tracked source |
| Build + deploy the `ssh-ca` edge function | `trust` route returns the zone's anchors for a known device |
| DB migration (`domains.pki_zone`, `devices.ssh_*`) | `just verify` green |
| Write `tasks/ssh_ca.yaml`; exercise it against a **throwaway container**, not hardware | a cert login succeeds in the container |

**Rollback:** delete the edge function and revert the migration. No gateway has
changed.

---

## Phase 1 — deploy CA trust and host certificates (additive)

Run `tasks/ssh_ca.yaml` on a **canary gateway**, then a small cohort, then the
fleet. On every gateway this writes only under `/etc/ssh`:

```
ssh_host_ecdsa_key(.pub)              generated if absent   (unique per device)
ssh_host_ecdsa_key-cert.pub  0444     host certificate
ssh-user-ca.pub              0444     zone User CA  → TrustedUserCAKeys
ssh-host-ca.pub              0444     zone Host CA  → KRL signature verification
auth_principals/root         0644     iotgw-admin, iotgw-ops
revoked_keys                 0444     empty file (sshd refuses to start without it)
sshd_config.d/50-iotgw-authorized-keys.conf   break-glass, sorts FIRST
sshd_config.d/60-iotgw-ssh-ca.conf            certificate auth
```

**Nothing is removed.** `authorized_keys` and the shared `/root/.ssh/id_rsa`
stay exactly as they are.

Guard rails, in order:

1. `sshd -t` **before** any reload. If it fails, the two drop-ins are deleted and
   the task aborts — the running sshd never sees the change.
2. `reload`, never `restart`. A reload does not drop existing sessions; a broken
   config on reload leaves the old config running.
3. Ansible keeps its existing connection open throughout; a second, independent
   connection is used to verify.
4. The canary is a gateway with physical/console access.

**Exit criterion:** `ssh-keygen -L -f /etc/ssh/ssh_host_ecdsa_key-cert.pub`
shows the right principals and validity, and `sshd -T` shows
`trustedusercakeys`, `hostcertificate`, `authorizedprincipalsfile`,
`revokedkeys` **and** `authorizedkeysfile .ssh/authorized_keys` together.

**Rollback:** delete the two drop-ins, `sshd -t`, `reload`. Back to the previous
state in one task; `authorized_keys` access was never interrupted.

---

## Phase 2 — enable and prove certificate authentication

| Step | Who | Proof |
|---|---|---|
| Issue an `iotgw-admin` cert for one operator in the pilot zone | pki-manager | `ssh-keygen -L` shows principal `iotgw-admin`, short TTL |
| Add the zone's `@cert-authority` line to that operator's `known_hosts` | `just ssh-trust` | — |
| Log in **from a fresh session**, with `IdentitiesOnly yes` and the raw key deliberately unavailable | operator | login succeeds; `sshd -E` log shows `Accepted certificate ID "…" signed by ECDSA CA … via /etc/ssh/ssh-user-ca.pub` |
| Confirm host verification | operator | connecting by the certified name produces **no** host-key prompt and no `known_hosts` entry is added |
| Confirm break-glass still works | operator | login with the old raw key still succeeds |

The `sshd` log line is the acceptance evidence — not "it logged in", which a
lingering raw key would also produce. `LogLevel VERBOSE` is required to see it.

**Exit criterion:** both paths work independently on the canary, verified from
two different machines.

**Rollback:** none needed — nothing was removed.

---

## Phase 3 — migrate operators and automation to certificates

| Step | Detail |
|---|---|
| Create one identity per operator **per domain** (zones are a hard partition) | `POST /api/v1/ssh/identities` |
| Issue certs; publish the renewal command | `scripts/ssh-ca/user-cert.sh` |
| Roll out `@cert-authority` trust to every operator | `just ssh-trust`; verify `ssh -G <gw>` shows the scoped `StrictHostKeyChecking yes` |
| Move the **Kestra runner** to an `iotgw-ops` certificate | the runner pod mints a short-lived cert at flow start instead of using `keys/id_rsa` |
| Turn on host verification in the inventories | replace `StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null` with a generated `known_hosts` carrying the `@cert-authority` line — **for the provisioned-gateway phase only**; the live-boot phase keeps TOFU until `decision-028` §5 resolves |
| Deploy `krl-client` + a 15-minute timer | verify a `block` on a test identity denies it on that gateway only |

**Exit criterion:** for 2 consecutive weeks, **zero** logins to any gateway
authenticate via a raw `authorized_keys` entry. Measured from `sshd` logs
(`Accepted publickey` without a certificate ID), not from intent.

**Rollback:** operators keep their raw keys throughout this phase; reverting is
a matter of not using the certificate.

---

## Phase 4 — verification gate (explicit, blocking)

No key is deleted until **all** of these hold, per gateway:

- [ ] the gateway presents a valid, unexpired host certificate with the expected principals;
- [ ] a certificate-only login succeeds from a machine that has never had a raw key for it;
- [ ] `sshd` logs show certificate acceptance, not raw-key acceptance;
- [ ] `RevokedKeys` is present and `krl-client` has completed at least one successful pull;
- [ ] a KRL block on a test identity is observed to deny, and the unblock to restore;
- [ ] the break-glass path has been tested **after** all of the above and still works;
- [ ] the gateway is not in the "offline / never enrolled" queue
      (`devices.ssh_ca_enrolled_at IS NOT NULL`).

A fleet-wide report over `devices.ssh_*` is the gate, so nobody has to remember
which gateways were done.

---

## Phase 5 — remove the legacy mechanism

Strictly ordered; each step is a separate, revertible change.

| # | Remove | Blast radius if wrong |
|---|---|---|
| 5.1 | the `wget github.com/sabatligats.keys` / `u.joor.net` block in `files/enable_ansible.sh` (replace with a vendored break-glass file) | new installs only |
| 5.2 | the shared `credentials/id_rsa{,.pub}` copy in `tasks/system.yaml` — **after** re-pointing the 12 `key_file: /root/.ssh/id_rsa` tasks | provisioning breaks; gateways stay reachable |
| 5.3 | `files/credentials/id_rsa*` and `keys/id_rsa` from both repos + the Kestra namespace blob | runner loses its raw key — must already be on `iotgw-ops` certs |
| 5.4 | the static `id_ed25519` private key from the live image | live image only |
| 5.5 | `authorized_keys` entries from gateways, **narrowing to the named break-glass set** rather than emptying the file | **highest** — do last, per cohort, with console access |
| 5.6 | `StrictHostKeyChecking=no` from the remaining inventories | flow failures, not lockouts |

**The break-glass set is never removed.** That is the stated requirement and the
only thing that survives a PKI outage or a mis-scoped KRL.

Deferred until the very end, and only with explicit sign-off: tightening
`PermitRootLogin` / `PasswordAuthentication` on gateways. Those were not weakened
by this migration and changing them is a separate risk.

---

## Rollback strategy, per phase

| Phase | Rollback | Time to restore |
|---|---|---|
| 0 | revert migration + delete edge fn | minutes, no gateway impact |
| 1 | delete the 2 drop-ins, `sshd -t`, `reload` | one Ansible tag run |
| 2 | nothing to roll back | — |
| 3 | operators fall back to raw keys (still present) | immediate |
| 4 | — (gate only) | — |
| 5.1-5.4 | `git revert` + re-run the relevant tag | one flow run |
| 5.5 | restore `authorized_keys` **via the break-glass key or console** | minutes if break-glass retained; **otherwise console-only** |

This is why 5.5 is last, per cohort, and why the break-glass set survives.

---

## Fleet state tracking

`devices` gains the columns in `decision-025` §D. The migration is driven off
them, not off a spreadsheet:

```sql
-- work queue
SELECT name FROM devices WHERE ssh_ca_enrolled_at IS NULL;
-- renewal queue
SELECT name FROM devices WHERE ssh_host_cert_valid_before < now() + interval '30 days';
-- gate report
SELECT count(*) FILTER (WHERE ssh_ca_enrolled_at IS NOT NULL) AS enrolled, count(*) FROM devices;
```

## References

`decision-023`/`-024`/`-025`/`-026`/`-028` ·
`pki-manager` `docs/ssh/host-blocks-runbook.md` (trust-anchor ordering, canary,
cutover, rollback — the same shape as phases 1-3) ·
`ssh-cert-test` §7 "Break-glass — the backdoor that survives a block"
</content>
