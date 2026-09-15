---
id: decision-028
title: "028: SSH CA open security and architecture decisions"
date: '2026-09-14 08:20'
status: proposed
---
## Context

`decision-024`…`-027` reference this document wherever a choice has a real
security or operational trade-off. Each section below is either **DECIDED**
(with the reasoning that makes it non-arbitrary) or **UNRESOLVED** (with a
recommendation and what evidence would settle it). Nothing here is chosen
silently: an UNRESOLVED item must be closed by its own task before the phase
that depends on it ships.

---

## §1 — Certificate validity periods

**Status: DECIDED (host + user).**

`pki-manager` defaults: host `+52w`, user `+1w`. Its stated model is
*"short lifetimes are the primary revocation mechanism; the KRL is the emergency
kill switch"*.

**Host certificates — DECIDED: 90 days, renewal attempted at 60 days
(remaining life < ⅓).**

- 52 weeks is too long for a device that can be physically stolen: with a
  quarterly cert, a gateway removed from the fleet and never offboarded stops
  being able to prove its identity within a quarter, without relying on the KRL
  reaching anything.
- 90 days with renewal at 60 leaves a 30-day window to notice and fix a broken
  renewal path before anything expires — wider than the longest plausible
  gateway outage we have observed, and wide enough to absorb a `pki.joor.net`
  outage of days.
- An expired **host** certificate degrades host *verification*, not login: users
  with valid certs still get in (they fall back to a host-key prompt). So the
  failure is loud but not a lockout.

**User certificates — UNRESOLVED.** The trade-off is genuine and depends on
facts we do not have:

| Class | Proposal | Open question |
|---|---|---|
| `iotgw-admin` (humans) | 8 h, renewed per working session | Do operators work from machines where a re-issue is cheap (a script + OIDC login), or from places where a failed renewal strands them? Field-office and on-site work argues for 24 h. |
| `iotgw-ops` (Kestra runner) | 1 h, minted at flow start | Requires the runner to hold an issuance credential. Is a `sign-user`-scoped fleet token in the runner pod acceptable, or must issuance stay in the backend and be handed to the pod? |

**Recommendation:** `iotgw-admin` = 12 h; `iotgw-ops` = 2 h minted per flow by
the **backend** (not the pod), so no issuance credential ever lands in a runner
pod. **Evidence needed:** one week of operator usage data on how often a
renewal would have been required away from a workstation.

### Decision (2026-09-15, task-070)

- **`iotgw-admin` = 24 h, with a documented offline renewal path.** Chosen over
  the 12 h recommendation because field/on-site sessions — where the operator
  cannot complete an OIDC login to `pki.joor.net` to renew — are common enough
  that a 12 h TTL would strand an operator standing next to a gateway. 24 h
  covers a normal working day plus travel; the offline path is documented so a
  stranded operator has a defined recovery rather than break-glass.
- **`iotgw-ops` = 2 h, minted per flow by the backend (not the runner pod).**
  No `sign-user`-scoped issuance credential ever lands in a Kestra runner pod;
  the backend mints the short-lived `iotgw-ops` cert and hands only the cert to
  the flow. (Answers §1 AC#2/#3.)
- **Trade-off accepted:** a departed `iotgw-admin` retains access for up to 24 h
  (vs 12 h). Short lifetimes remain the routine revocation mechanism; the KRL is
  the emergency path for the rare case where 24 h is too long.
- **Application in code** (§1 AC#4) is carried by the backend issuance work and
  the Kestra runner task — the TTLs above are the values those must apply.

---

## §2 — Principal naming strategy

**Status: DECIDED, with one UNRESOLVED sub-point.**

**DECIDED — user principals:** exactly two per zone, `iotgw-admin` and
`iotgw-ops`, both mapped to `root` in `/etc/ssh/auth_principals/root`.

- OpenWRT has effectively one usable account (`root`), so per-account principals
  would be theatre. The split exists so automation can be blocked, rate-limited
  or `ForceCommand`-restricted without touching humans.
- Zone-per-domain already partitions the namespace, so principals do **not**
  need a domain prefix — `iotgw-admin` in zone `iotgw-acme` cannot be used in
  zone `iotgw-beta`.
- Deliberately **not** per-person principals: that reintroduces the
  "edit a file on every gateway to grant access" problem the migration exists to
  remove. Per-person *authorisation* is expressed by whether an identity is
  issued a certificate, and by per-host blocks — both central.

**DECIDED — host principals:** `<device>.<network>.<domain>.iotgw`,
`<device>.<domain>.iotgw`, and the WireGuard IP. The `.iotgw` suffix is a
private, deliberately non-resolvable TLD; clients pin it with `HostKeyAlias`,
the pattern already in use for `ovh-ymbihq-node` in the operator `~/.ssh/config`.

**UNRESOLVED — including the IP address as a host principal.** Including it
makes `ssh root@10.121.x.y` verify cleanly, which is how operators actually work
today. But WireGuard IPs are reassignable: if a device is deleted and its IP
recycled, the old (unexpired, un-offboarded) certificate would still validate
for the new occupant's address. **Recommendation:** include the IP, and make
`offboard-host` on device delete mandatory and monitored (§10), so a recycled IP
is always preceded by a revocation. **Evidence needed:** confirm Netmaker's IP
reuse behaviour for deleted extclients.

---

## §3 — CA separation and scope

**Status: DECIDED.**

One `pki-manager` **zone per `iotgw-ng` domain**, each with its own User CA and
its own Host CA. No CA is ever shared between domains.

- This is the explicit requirement, and it maps exactly onto `pki-manager`'s
  cardinality (one `active` + one `rotating` per `(zone, ca_type)`).
- It is a real boundary, not a label: a host in zone Z trusts only Z's user CAs,
  and Z's KRL never mentions another zone.
- Cost accepted: an operator working across N domains needs N identities and N
  certificates; there is **no** cross-zone trust in `pki-manager` v1 and we will
  not build one.

Separate User and Host CAs (rather than one CA for both) is also DECIDED — it is
how `pki-manager` is built, and it means compromising the host-signing path
cannot mint user certificates.

---

## §4 — CA rotation

**Status: UNRESOLVED (mechanism is clear; cadence and trigger are not).**

`pki-manager` supports one `active` + one `rotating` CA per `(zone, type)`, and
publishes both anchors during the overlap, so rotation is mechanically
non-disruptive.

Open: **how often, and on what trigger.** The binding constraint is that the
overlap window must exceed the host-certificate TTL (§1 → 90 days), because a
gateway only picks up new anchors when it enrolls or renews.

**Recommendation:** no scheduled rotation; rotate on compromise or on a
documented policy event, with a mandatory ≥120-day overlap and a fleet report
proving every device re-issued before the old CA is retired. **Evidence
needed:** confirm `pki-manager` publishes `rotating` anchors on the endpoints
the `ssh-ca` edge function reads (`/api/v1/ssh/trust-anchors`), not only on the
public routes.

---

## §5 — Live-image host identity and bootstrap trust

**Status: UNRESOLVED. This is the most significant gap in the design.**

The live (Clonezilla) image has **no host keys** — they are generated per boot —
so the install phase has no server authentication at all, and every inventory
carries `StrictHostKeyChecking=no`. An attacker on the provisioning network can
impersonate a machine that is about to have an OS written to it.

Options:

| Option | Pro | Con |
|---|---|---|
| **A. Keep TOFU for the live phase** | zero work; the window is short and on a controlled network | the MITM window is exactly the window in which we install the OS and the trust material |
| **B. Bake a host key + long-lived cert into the image** | trivial verification | a **shared private key in an image** — precisely what we are removing (R4). Rejected. |
| **C. Live image self-enrolls at boot** (generates a key, requests a short-lived host cert over the same TOTP channel) | real verification, no shared secret | the live machine has no device identity yet — it does not know *which* device it is until the operator types `maquina_id` at the iPXE prompt. Needs a bootstrap identity. |
| **D. Out-of-band fingerprint** — the live image prints its host-key fingerprint to console/serial, the operator pins it | strong, no PKI dependency | manual, does not scale, defeats unattended install |

**Recommendation: A for phase 1 (documented as a known, accepted exposure,
scoped to a controlled provisioning network), C as the target** — using the
`maquina_id` already entered at the iPXE prompt as the bootstrap identity, with
a short-lived (hours) host certificate whose principal is
`live-<maquina_id>.<domain>.iotgw`.

> **Option C is proven feasible (2026-09-14).** Tested against a real
> live-booted gateway at `10.2.0.210`:
>
> - The live image **does** generate an `ssh_host_ecdsa_key` at boot
>   (`SHA256:2OSZAQlMvD952t3KLBVY5TDNcivckCyBOMMJ+bKCWZE` on that boot), so it
>   is ECIES-capable and signable as-is — no image change is needed to give the
>   live phase a host identity.
>   *(Earlier reading of the unpacked squashfs showed no `ssh_host_*` files,
>   which is correct for the image at rest but says nothing about runtime.)*
> - That key was signed by the pilot zone's Host CA for
>   `live-canary-20260914.warehouse.iotgw` + `10.2.0.210` with a **4-hour**
>   validity, installed, and `sshd -t` + reload accepted it.
> - A client holding only the Host CA as an `@cert-authority` line then
>   connected with `StrictHostKeyChecking=yes`, succeeded, and **added no
>   `known_hosts` entry** — i.e. the install phase can have real server
>   authentication without pinning anything per-machine.
> - The live image also has `Include /etc/ssh/sshd_config.d/*.conf` already
>   present and the drop-in directory empty, plus `openssl`, `python3`, `curl`
>   and `ssh-keygen` — everything a self-enrollment needs.
>
> What remains unproven is the **identity binding**, not the mechanics: the
> signing call was made by an operator, not by the live machine proving who it
> is. That is the same gap as §12, and it is what still blocks C.
>
> Measured clock skew on that boot was **135 s** against the controller — inside
> the ±600 s TOTP window and inside certificate tolerance, but the live image
> reports `System clock synchronized: no`, so this is luck rather than design.
> A live-phase self-enrollment must sync the clock first.

**Evidence still needed:** is the provisioning network genuinely isolated, and is
`maquina_id` reliably known before boot (it is typed by a human at the iPXE
prompt today, which is a weak binding)?

**Related and also UNRESOLVED:** what the live image's `TrustedUserCAKeys`
should contain. It cannot know which domain the machine will belong to, so it
must trust **every** `iotgw-ng` zone's User CA — which means any `iotgw-admin`
from any domain can log into any machine during its install phase. Acceptable
for a controlled network; unacceptable if the live image is ever used
off-premises. **Recommendation:** a dedicated `iotgw-installer` principal and a
separate installer-only zone, so live-phase access is not the same grant as
production gateway access.

### Decision (2026-09-15, task-071)

- **Host verification: Option C — the live image self-enrolls a short-lived host
  certificate, bound to the `device_id` + OTP channel, not to the operator-typed
  `maquina_id`.** The served `menu.ipxe` already exposes this channel: the
  `vpn` menu item does `read device_id` + `read otp` (TOTP, `decision-009`) and
  boots a newer image (`clonezilla-debian-3.1.2-9-2025-11-06/`), whereas the
  `backup`/`restore` install path only does `read maquina_id` — free-text, with
  zero verification. So the strong binding is not something we must invent; it
  already exists on the OTP path, and the install phase is to move onto it.
  - **Answers AC#2 / §12:** the live machine proves who it is via the
    `device_id`+OTP the operator supplies at the iPXE prompt, and the host cert
    is signed only after that proof — *not* operator-driven signing against an
    unverified name. This leans on §12 / task-075 for the enrollment-binding
    detail; the `maquina_id` free-text path is explicitly **not** the identity
    source.
  - **Residual exposure (accepted):** until the self-enrolling image ships
    (task-095), the current image still boots with `StrictHostKeyChecking=no`,
    so a phase-1 install performed before task-095 runs with TOFU. Accepted
    because the provisioning segment is an isolated lab bench (see AC#4 below)
    and the window is short.
  - **Clock-sync prerequisite (AC#5):** verified still live — 10.2.0.210 reports
    `System clock synchronized: no`. Because host certificates are time-bound,
    self-enrollment **must** sync the clock (NTP/`chrony` against the controller)
    *before* requesting a cert. This is a design step in task-095, not a
    footnote.

- **User CA trust scope: the live image trusts every `iotgw-ng` zone's User CA**
  (the concatenated `active`+`rotating` User CA of each zone), not a dedicated
  installer zone. Chosen because the provisioning network is a controlled,
  isolated lab bench, so "any `iotgw-admin` from any domain can log in during
  install" is an accepted grant. **Condition:** this holds *only* while the image
  is used on the isolated bench; if the live image is ever used off-premises,
  revisit and move to a dedicated `iotgw-installer` principal + zone.

- **Provisioning-network isolation (AC#4, checked):** the PXE/provisioning
  segment is an **isolated lab bench** — dedicated segment carrying only the
  controller and machines being installed; it does **not** share L2 with the
  production or office networks. This is the fact the two decisions above rely
  on.

---

## §6 — Revocation and KRL behaviour

**Status: DECIDED (strategy), UNRESOLVED (transport).**

**DECIDED:** three tiers, in order of reliance —
1. **Short TTLs** (§1) are the primary mechanism.
2. **Per-host access blocks** (`pki-manager` `decision-016`) for "deny this
   person on this gateway, now" — the cert stays valid elsewhere.
3. **Offboard** for decommissioning a whole gateway.

`sshd` re-reads `RevokedKeys` on **every** publickey authentication, so an
installed KRL takes effect on the next login with no reload. `sshd` refuses to
start if `RevokedKeys` points at a missing file — the empty-file step in
`decision-026` 3.12 is load-bearing.

**UNRESOLVED — how the KRL reaches a gateway.**

| Option | Pro | Con |
|---|---|---|
| **`krl-client` + ECIES** (the PoC path) | encrypted per-host KRL, Host-CA-signed, anti-rollback, verified before install; no fleet token on the device | needs a Go static binary on OpenWRT x86-64 and an **ecdsa-P256** host key; needs direct egress to `pki.joor.net` (or a broker) |
| **Public bare KRL over cron** (`GET /krl/:caId.bin`) | trivial, `wget` only | integrity rests on TLS + file perms; per-host blocks require `SSH_HOST_KRL_PUBLIC=true`, which leaks per-host deny intel unauthenticated |
| **Broker through the `ssh-ca` edge function** | no new egress; consistent with §9 | the broker cannot decrypt an ECIES payload (only the host can), so it would have to proxy opaque bytes — workable but unproven |

**Recommendation:** `krl-client` + ECIES, brokered or direct, which is why
`decision-024` mandates **ecdsa-P256** host keys. **Evidence needed:** does the
static `krl-client` binary run on OpenWRT 23.05 x86-64 (musl vs glibc), and what
is its footprint on a gateway's flash?

---

## §7 — Fate of `devices.ssh_key_id` (the per-device Cosmian KMS key)

**Status: UNRESOLVED.**

`decision-010` mints an Ed25519 key per device in Cosmian KMS; `task-069` makes
the Kestra runner fetch it as `keys/id_rsa`. But **nothing ever installs its
public half into any gateway's `authorized_keys`** — the "deploy to device" step
was specified and never implemented. So today the key is fetched and used as a
client credential against a host that does not trust it; the flows only work
because of the fallback to the personal `oriol@mini6` key.

Options:

| Option | Meaning |
|---|---|
| **A. Retire it** | the runner authenticates with an `iotgw-ops` **user certificate**; the KMS key becomes dead weight; `decision-010` is superseded for this purpose. |
| **B. Repurpose as the gateway's *outbound* identity** | the gateway uses it to authenticate *to* things (backup targets, the `autossh` tunnel), replacing the shared `credentials/id_rsa`. The KMS becomes the per-device outbound key store. |
| **C. Keep as a break-glass inbound key** | install its public half in the gateway's `authorized_keys` as a per-device break-glass — better than a fleet-wide shared key. |

**Recommendation: A + B.** The runner moves to certificates (A), and the KMS key
replaces the shared `credentials/id_rsa` as a per-device *outbound* key (B),
which is what finally removes R1. C is tempting but adds a second inbound
credential to manage per device.

**Cannot be decided without:** an inventory of what actually consumes
`/root/.ssh/id_rsa` on a live gateway (12 task files reference it as a docker
`key_file`, but whether those connections are real or vestigial is unverified).

---

## §8 — Offline gateways and certificate expiry

**Status: DECIDED.**

A gateway that is offline past its renewal window ends up with an expired host
certificate. Consequences, and why this is acceptable:

- **Login is unaffected.** An expired *host* cert means clients fall back to a
  host-key prompt; user certificates still authenticate.
- **The break-glass `authorized_keys` set is retained precisely for this**
  (`decision-027` phase 5).
- Recovery is one `tasks/ssh_ca.yaml` run once the gateway is reachable again;
  the host key is unchanged, so it is a re-sign, not a re-key.
- `krl-client` fails **stale**, not open: it keeps its last-good KRL rather than
  clearing it.

Deliberately **not** doing: auto-extending validity for devices we cannot reach,
or falling back to a longer TTL on renewal failure. Both convert an operational
problem into a security one.

---

## §9 — Authentication and authorisation between `iotgw-ng` and `pki-manager`

**Status: DECIDED (split), UNRESOLVED (service-account scoping).**

**DECIDED — two credentials, least-privilege split:**

| Credential | Holder | Scope |
|---|---|---|
| Fleet token `pkimg_…`, one per zone | `ssh-ca` **edge function** | `sign-host`, `register-host-pubkey`, `get-principals`; bound to that zone's Host CA |
| OIDC service account | `iotgw-ui` **backend** | zone/CA/principal creation, trust-anchor reads, `offboard-host`, `block`/`unblock` |

The edge function is reachable from the device network, so it gets the weaker
credential: it **cannot** create CAs, issue user certificates, or offboard hosts.
A compromised edge function can, at worst, mint host certificates for FQDNs
within one zone — bad, contained, and detectable in `pki-manager`'s audit log.

**UNRESOLVED — exact service-account scoping.** `pki-manager` has no per-zone
OIDC RBAC yet (explicitly deferred in its `decision-017`), so the backend's
service account is effectively **admin over the whole PKI**, including other
tenants of `pki.joor.net`. That is more authority than this integration needs.

**Recommendation:** either (a) `pki-manager` adds zone-scoped OIDC roles
(`ssh-admin:<zone>`), or (b) `iotgw-ng` runs its own `pki-manager` instance so
the blast radius is the `iotgw-ng` fleet only. **Evidence needed:** who else
depends on `pki.joor.net` today, and is a second instance acceptable
operationally?

---

## §10 — Ownership of host registration and decommissioning

**Status: DECIDED, with a caveat.**

`iotgw-ng` owns the fleet; `pki-manager` owns the certificates. Therefore:

- **Registration** is implicit — `POST /api/v1/external/ssh/sign-host`
  auto-registers a host on first call. The `ssh-ca` edge function is the only
  caller, and it derives the FQDN from the `devices`/`networks`/`domains` rows,
  so the PKI's host list is a projection of `iotgw-ng`'s device list.
- **Decommissioning** is driven from `iotgw-ng`: deleting a device calls
  `offboard-host`.

**Caveat (accepted, not open):** `offboard` is **terminal** in `pki-manager` —
there is no un-offboard, `(zone, fqdn)` stays unique so the FQDN can never be
re-registered, and the row is retained by design for audit. Therefore:

- Device deletion in `iotgw-ng` must be a **deliberate** action, not a
  consequence of a failed sync.
- Re-creating a device with the same name in the same network/domain **will
  fail** to enroll. The FQDN derivation must therefore include something
  non-recyclable — we use the device **UUID prefix** in the registered FQDN
  where a collision would otherwise occur. *(This is a change to
  `decision-024` §4's principal list: the registered `fqdn` may differ from the
  human-facing principals; principals are what clients use.)*

---

## §11 — Emergency access (break-glass)

**Status: DECIDED.**

A named, minimal raw-key `authorized_keys` set is **retained indefinitely** on
gateways and in the live image, via the `50-iotgw-authorized-keys.conf` drop-in
that sorts before the CA drop-in so its `AuthorizedKeysFile` wins.

Properties, verified in `ssh-cert-test` §7:

- A raw key is not a certificate, so **no KRL entry and no per-host block can
  deny it**. That is the point — and exactly why it must be tightly scoped.
- It also bypasses the principal model entirely.

Therefore, as conditions of retaining it:

- every entry is **attributed** (the current unattributed
  `SHA256:VMJ3Hr…` entry must be identified or removed — see
  `decision-025` §A);
- the set is **vendored in-repo**, never fetched from `github.com/*.keys` at
  install time;
- its use is alertable (`sshd` `LogLevel VERBOSE` distinguishes
  `Accepted publickey` from `Accepted certificate ID`);
- to kill one centrally, its **fingerprint** is added to the KRL.

---

## §12 — Gateway identity binding (what proves a device is that device)

**Status: DECIDED (task-075) — proof-of-continuity; source-address binding dropped.**

Enrollment authenticates the gateway with the device TOTP derived from
`domain_id-network_id-device_id-totp_counter` (`decision-009`). That secret is
derived entirely from **database identifiers**, so anyone who can read (or
guess) those four values can impersonate the device to the `ssh-ca` edge
function and obtain a host certificate for it.

Mitigating facts: the ids are UUIDs, the window is 600 s ±1, and
`totp_counter` can be bumped to invalidate. Aggravating facts: the ids are not
secrets by design — they appear in job tables, UI URLs and logs — and the
resulting artefact (a host certificate) is far more valuable than the WireGuard
config the mechanism was designed for.

Options: enrollment-token-per-device (one-time, issued with the device, consumed
at enrollment); TPM/secure-element attestation; binding to the WireGuard tunnel
(only accept enrollment from the device's own VPN IP); manual operator approval
of the first enrollment.

**Recommendation:** bind enrollment to the device's WireGuard source address
**and** make first enrollment one-shot (subsequent re-enrollments must present
the existing host key, proving continuity). Neither requires new hardware.
**Evidence needed:** whether the edge function can see the true client address
through Kong/ingress, and whether enrollment happens before or after the tunnel
is up (`decision-026` phase 3 currently runs it over the tunnel — which would
make the address binding available).

> **Warning on the source-address half of that recommendation (2026-09-14).**
> On the live gateway at `10.2.0.210`, `sshd` logged every inbound connection
> from the controller as coming from `10.2.0.47`, not from the controller's own
> address — i.e. **there is NAT on the provisioning path**. If the gateway →
> Kong path is NATed the same way, every gateway in a segment would present the
> *same* source address to the `ssh-ca` edge function, which makes address
> binding nearly worthless as an identity signal (it would attest a segment, not
> a device). This must be measured on the real gateway → Kong path before the
> recommendation is adopted; the one-shot / proof-of-continuity half is
> unaffected and is the stronger of the two.

### Decision (2026-09-15, task-075)

- **Binding = proof-of-continuity.** First enrollment is **one-shot**: the
  `ssh-ca` edge function issues a host cert for a given device identity exactly
  once. Every subsequent re-enrollment must **present the existing host key**
  (prove control of the private half signed last time), so a reader of the
  non-secret `domain_id-network_id-device_id-totp_counter` values cannot silently
  obtain a *second* host cert for a device that has already enrolled.
- **Source-address binding is dropped**, not deferred. The 2026-09-14 measurement
  showed NAT on the provisioning path (`sshd` saw the controller as `10.2.0.47`),
  so a WireGuard/source-address binding would attest a **segment, not a device** —
  no identity value. AC#1's "measure the gateway → Kong path" is therefore moot
  for the *chosen* binding: address is not used, so it need not be trusted.
- **Residual exposure (accepted):** the **first** enrollment of a
  never-yet-enrolled device still authenticates only with the non-secret TOTP
  inputs. Whoever wins the race to enroll first gets the cert; proof-of-continuity
  then locks out the loser (the legitimate device detects it cannot re-enroll and
  the mismatch is alertable). Acceptable because enrollment happens on the
  isolated provisioning bench (§5 AC#4). A one-time enrollment token or operator
  approval remains the future upgrade if first-enrollment on an untrusted network
  is ever required.
- **To implement** (§12 AC#3/#4): `decision-026` phase 3 and the `ssh-ca` edge
  function must (a) record that a device identity has enrolled and refuse a second
  first-enrollment, and (b) require the existing host key on re-enrollment. Carried
  by the ssh-ca edge-function + task-089 work.

---

## Summary

| § | Topic | Status |
|---|---|---|
| 1 | Host cert validity (90 d / renew at 60 d) | **DECIDED** |
| 1 | User cert validity | **DECIDED** (task-070) — 24 h admin (+offline path) / 2 h ops, backend-minted |
| 2 | User + host principal naming | **DECIDED** |
| 2 | IP address as a host principal | **UNRESOLVED** — rec. include + mandatory offboard |
| 3 | CA separation (zone per domain, split user/host) | **DECIDED** |
| 4 | CA rotation cadence | **UNRESOLVED** — rec. event-driven, ≥120 d overlap |
| 5 | Live-image host identity / bootstrap trust | **DECIDED** (task-071) — self-enroll (C) bound to device_id+OTP; TOFU accepted until task-095 |
| 5 | Live-image User CA scope | **DECIDED** (task-071) — trust every zone's User CA; isolated bench; revisit if used off-prem |
| 6 | Revocation strategy (TTL → block → offboard) | **DECIDED** |
| 6 | KRL transport | **UNRESOLVED** — rec. `krl-client` + ECIES |
| 7 | Fate of `devices.ssh_key_id` | **UNRESOLVED** — rec. retire inbound, repurpose outbound |
| 8 | Offline gateways / expiry | **DECIDED** |
| 9 | iotgw-ng ↔ pki-manager credential split | **DECIDED** |
| 9 | OIDC service-account scoping | **UNRESOLVED** — rec. zone-scoped RBAC or own instance |
| 10 | Host registration + offboard ownership | **DECIDED** (terminal-offboard caveat) |
| 11 | Break-glass emergency access | **DECIDED** |
| 12 | Gateway identity binding at enrollment | **DECIDED** (task-075) — proof-of-continuity (one-shot first enroll + existing-host-key re-enroll); address binding dropped (NAT) |

No phase of `decision-027` may ship past the point where it depends on an
UNRESOLVED item. Specifically: phase 1 requires §5 to be *accepted as a
documented exposure*; phase 3 requires §1 (user TTL) and §6 (KRL transport);
phase 5 requires §7 and §12.
</content>
