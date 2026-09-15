---
id: m-1
title: "SSH CA migration (pki-manager)"
---

## Description

Replace individually-deployed SSH public keys on iotgw-ng gateways with OpenSSH
certificate authentication, consuming `pki-manager` (https://pki.joor.net) as
the sole PKI. One pki-manager **zone per iotgw-ng domain**, each with its own
User CA + Host CA; gateways generate their own host keys and receive only public
trust material; operators authenticate with short-lived user certificates and
verify gateways via `@cert-authority`. A named break-glass `authorized_keys` set
is retained.

Traceability: decision-023 (current state) · decision-024 (target architecture)
· decision-025 (change map) · decision-026 (provisioning sequence) ·
decision-027 (migration plan) · decision-028 (open decisions).

**Gating:** no task may close a decision-027 phase while the decision-028 item it
depends on is still UNRESOLVED.

## Where to start

Tasks carry dependencies, so `backlog task <id> --plain` shows what blocks what.
The shape of the graph:

**Six architectural questions gate almost everything.** They are cheap in code
and expensive to get wrong, so they come first: the user-certificate TTLs
(`§1`), the live-image host identity (`§5`), the KRL transport (`§6`), the fate
of the per-device KMS key (`§7`), the scope of the pki-manager credential
(`§9`), and what actually proves a gateway is that gateway at enrollment
(`§12`) — plus the two that had no task until later, the IP-as-principal
question (`§2`) and CA rotation (`§4`).

**The critical path to a migrated fleet** runs:

```
supabase-anon Secret  ┐
publish to iotgw-kestra ┘─▶ tasks/ssh_ca.yaml ─▶ canary gateway ─▶ fleet rollout
                                    │                                    │
                          gateway-side renewal ──────────────────────────┘
                                                                         ▼
                                               cleanup of legacy keys ─▶ docs
```

Everything on that path needs **an installed OpenWRT gateway**, which is the
scarce resource in this milestone — the enrollment chain has already been proven
against a container and against a live-booted Clonezilla machine, so what the
canary is really testing is the OpenWRT specifics (init-script name, the missing
`Include` line, `sshd` paths).

**Already true, so do not redo it:** the pilot zone `iotgw-lab` exists on
pki.joor.net with its CA pair, principals and a fleet token; the `ssh-ca` edge
function signs, is idempotent, fails closed and rejects bad TOTPs; the DB
columns exist; and a certificate-only login against a real `sshd` has been
observed in the logs, with break-glass surviving alongside.

**Two things carry irreversible consequences.** pki-manager's `offboard` is
terminal — a `(zone, fqdn)` pair can never be re-registered — and the break-glass
key set is the only access that survives a PKI outage or a mis-scoped KRL, so it
is narrowed and never emptied.
</content>
