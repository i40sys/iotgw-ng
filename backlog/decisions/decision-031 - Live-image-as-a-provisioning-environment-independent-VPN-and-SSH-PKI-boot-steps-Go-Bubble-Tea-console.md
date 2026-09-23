---
id: decision-031
title: >-
  031: Live image as a provisioning environment: independent VPN and SSH PKI boot
  steps, Go Bubble Tea console
date: '2026-09-23 07:31'
status: accepted
---
## Context

The PXE live image (the iPXE **`VPN test`** entry, tree
`clonezilla-debian-3.1.2-9-2025-11-06` on y0) is a Clonezilla image with
provisioning scripts added on top. Inspected on a live-booted gateway (`gw-c3`)
and in the served squashfs on 2026-09-23:

| Concern | What it did |
|---|---|
| Operator UI | tty1 getty auto-logs in `user`. Clonezilla's boot hook `/etc/ocs/ocs-live.d/S03prep-drbl-clonezilla` (run by `start-ocs-live.service`) appends `sudo -i ocs-live-run-menu` to `~user/.bash_profile` → the Clonezilla ncurses menu. |
| VPN | `vpn-setup.service` → `/opt/scripts/vpn.sh`: one openssl-envelope call to `vpn`, `wg-quick up`. Logs go to a file. A rejected code left a `wg0.conf` containing `bad magic number` and no visible error. |
| SSH trust | **Statically baked** by task-095: one `ssh-user-ca.pub`, which was **`iotgw-lab` only**, not even the "every zone" that decision-028 §5 requires. A device of any other domain (e.g. `comforsa`) rejected the runner's `iotgw-ops` cert: `Permission denied (publickey)`. |
| Host identity | Host keys are regenerated every boot, with no certificate, so SSH to the live image was always TOFU. |
| `rc.local` | Ran `/opt/${clonezilla}.sh`, which does not exist in this tree, so it failed on every boot. |

On the server side, task-087 had added `vpn?with_ssh_ca=true`, which returned the
VPN config and the SSH trust bundle in one response. Nothing consumed it
(task-109 was parked). `ssh-ca` already had a separate `trust` action, but only
`enroll` signed a host key, and `enroll` writes the device's **permanent**
enrollment fields (`ssh_host_*`).

## Decision

### 1. VPN configuration and SSH PKI configuration are two independent APIs and two independent boot steps

```text
VPN configuration API  !=  SSH PKI configuration API
```

- **VPN:** `POST /functions/v1/vpn?device_id=…` returns **only** the WireGuard
  configuration. The combined `?with_ssh_ca=true` mode is **removed**.
- **SSH PKI:** `POST /functions/v1/ssh-ca?device_id=…` with the new action
  **`live-enroll`**. It returns the domain's trust bundle (User CA, Host CA,
  `@cert-authority` lines, principals) **plus a short-lived host certificate
  for the live image's per-boot host key**.
- Both keep the existing device envelope (OpenSSL-compatible AES-256-CBC keyed
  by the device's one-time code, decision-009). They share no code path beyond
  that primitive, so either can fail, be diagnosed and evolve without the other.
- A VPN failure never skips the PKI steps, and a PKI failure never marks VPN
  steps failed.

### 2. The live host identity is separate from the permanent enrollment

`live-enroll` signs the boot-time ECDSA host key under a **separate pki-manager
host record**:

- **FQDN:** `live-<name>-<id8>.<network>.<domain>.iotgw`. Principals are that
  FQDN and `live-<name>.<network>.<domain>.iotgw`. There is **no IP principal**:
  the VPN IP belongs to the permanent identity, and task-102 offboards by it.
- **Validity:** 12 h, `LIVE_HOST_CERT_VALID_SECONDS`.
- **Device row:** never read or written. None of the `ssh_host_*` enrollment
  fields change, so the installed OpenWRT system's real enrollment (task-075
  continuity rules) is unaffected. Verified: `gw-c3`'s enrollment fields stayed
  empty after a live-enroll.
- **Per boot:** pki-manager's `sign-host` upserts by (zone, FQDN), so every boot
  re-signs that one live record's new per-boot key.
- **Authentication:** possession of the device code, the same bar as a first
  enroll on the isolated provisioning bench (decision-028 §5). No continuity
  proof, because the live key is per-boot by design.

This implements decision-028 §5 option C ("live image self-enrolls at boot",
bound to device_id + OTP). It **amends** §5's "trust every zone's User CA"
static bake: the live image now trusts **only its own domain's** User CA,
delivered at boot.

### 3. Boot sequence — `iotgw-bootstrap` (Go, root, systemd oneshot)

```text
Linux boot → network → identity (device_id + otp from the iPXE prompt)
  → [VPN]  vpn API → write wg0.conf → wg-quick up → wait for handshake
  → [PKI]  ssh-ca live-enroll → install User CA + principals → host cert + HostCertificate
           → @cert-authority known_hosts → sshd -t → reload → verify with sshd -T
  → iotgw-status dashboard on tty1 (starts regardless; shows PENDING until done)
```

- **State file:** every step records `HEALTHY` / `WARNING` / `FAILED` /
  `NOT CONFIGURED` with its message, endpoint, HTTP status, error and times in
  **`/run/iotgw/bootstrap.json`**. The file is world-readable and holds no
  secrets: no code, no private key.
- **Logging:** to the journal (`journalctl -u iotgw-bootstrap`). Nothing is
  written to the console the dashboard owns.
- **Explicit failures:** a failed `ssh-ca` call is reported as "SSH CA
  configuration MISSING" and the dependent steps as `NOT CONFIGURED`. The sshd
  drop-ins (`60-iotgw-ssh-ca.conf`, `61-iotgw-live-host-cert.conf`) are
  written **only on success**; `sshd -t` failure rolls them back.
- **Retry without a reboot:** `sudo iotgw-bootstrap --otp <current code>`
  retries after the boot-time code has expired.
- **Full-tunnel fixes found in the live test:**
  - The API's /32 is pinned to the physical uplink before `wg-quick up`, for
    when the API is not on-link.
  - The hostname is added to `/etc/hosts`. Otherwise every `sudo` stalls on
    DNS, which is unreachable once the full tunnel is up.
- **What the image loses:** the static trust bake (`60-iotgw-ssh-ca.conf`,
  `ssh-user-ca.pub`, `auth_principals/root`), `vpn-setup.service` +
  `/opt/scripts`, and `rc.local`. The **`50-` break-glass drop-in is kept.**

### 4. The operator UI is `iotgw-status`, a Go + Bubble Tea dashboard

- **Libraries:** Bubble Tea v1 (model/loop), Lip Gloss (layout), Bubbles
  (viewport, key bindings).
- **Binary:** a single static `CGO_ENABLED=0` binary at
  `/usr/local/bin/iotgw-status`. No Go toolchain goes into the image.
- **Architecture:** collectors are small read-only probes, each with its own
  timeout and no presentation code. They return structured state, and the
  Bubble Tea model renders it. Collectors run in `tea.Cmd`s off the update
  loop (fast tick 3 s for kernel-local state, 20 s for off-machine probes,
  manual `r`, one in flight per collector), so a hung DNS lookup or a dead VPN
  never freezes the screen. The dashboard **never calls a provisioning API**;
  it only observes.
- **Panels:**
  - Provisioning steps.
  - Host: CPU, RAM, disks, kernel, boot source, image and dashboard version.
  - Network: interfaces, MAC, link, IPv4/6, default gateway, real Internet
    egress with policy routing, DNS.
  - Internet: DNS / TCP-by-IP / HTTPS, graded separately.
  - VPN: config fetched/applied, `wg0`, address, endpoint, last handshake,
    transfer, routes.
  - VPN server reachability:
    - DNS, the route (flagged if it points *into* the tunnel), ICMP;
    - **the WireGuard handshake as the real protocol check.** WireGuard is UDP
      and silent to unauthenticated probes, so there is deliberately **no TCP
      port check**.
  - SSH PKI:
    - User CA: requested/received/installed, fingerprint, sshd trust;
    - Host CA: fingerprints, known_hosts;
    - this machine's **host identity**, kept separate from the CA: key,
      certificate, principals, expiry, signer, sshd `HostCertificate`;
    - sshd.
- **Keys and display:** `d` opens a details view for everything not HEALTHY
  (endpoint, HTTP status, error, last attempt). Every status has a text symbol
  and word (`[+] HEALTHY`, `[X] FAILED`, …), so it works without colour. The
  layout switches between two columns (≥110 cols) and one, and scrolls.
- **Privileges:** runs unprivileged as the console user. Only `wg show` and
  `sshd -T` go through `sudo -n`, which the live account already has NOPASSWD.
  A read failure shows as UNKNOWN, never as a guessed WARNING.
- **Startup mechanism:** Clonezilla's own boot-hook chain. New hook
  `/etc/ocs/ocs-live.d/S98iotgw-console` runs after `S03prep-drbl-clonezilla`
  and rewrites the auto-login `.bash_profile` to launch `iotgw-status` **once
  per boot** on tty1 (marker `/run/iotgw-console/launched`, owned by the
  user). **`q`** restores the terminal and leaves a normal shell with **no
  relaunch loop**; `iotgw-status` reopens the dashboard.
  A tty1 systemd unit was rejected: it would fight the getty, and "exit to a
  shell on the same console" would need a second process to hand the tty over.
  The profile is exactly the entry point Clonezilla itself uses.
  Clonezilla tooling stays installed.

### 5. Where it lives and how it is built

- **Served as its own permanent tree** `iotgw-live/` on y0
  (`netboot.joor.net/iotgw-live/`), booted by the iPXE entry **"IoT gateway
  live provisioning (iotgw-live)"** (menu item `iotgw-live`, *Provisioning*
  group), which prompts for the device username and one-time code. It was
  derived once from the Clonezilla `VPN test` tree's served image, and that tree
  and its entry are left untouched. New versions are installed in place with
  `deploy.sh --swap`, keeping the previous image as `filesystem.squashfs.bak`.
  The menu was backed up as `config/menu.ipxe.bak-20260923-pre-iotgw-live`.

- `live-image/` (Go module `github.com/i40sys/iotgw-ng/live-image`):
  - `cmd/iotgw-status`, `cmd/iotgw-bootstrap`;
  - `internal/{state,envelope,bootstrap,collect,tui,netinfo,sysexec,cmdline,version}`;
  - `overlay/` (rootfs additions), `remove.list` (superseded legacy paths).
- **`live-image/build.sh`:** `go vet` + `go test`, static builds with
  version/commit/date via `-ldflags`, writes `/etc/iotgw-live-release`, and
  produces a root-owned, `go-w` overlay tarball.
- **`live-image/deploy.sh [--swap]`:** uploads the tarball to y0 and runs
  `scripts/live-image/rebuild.sh --tree <VPN test tree> --remove … --sync-from …
  --stage|--swap`. `rebuild.sh` gained `--remove PATH`.

## Consequences

### Positive

- An operator sees at a glance what works and what does not, VPN and PKI
  separately, instead of a Clonezilla menu and a later `Permission denied`.
- The Kestra path (runner → `iotgw-jump` bastion → live gateway, decision-030)
  now authenticates **both ways** with certificates. Proven on `gw-c3`:
  - the `iotgw-ops` user cert logs in;
  - the client verifies the live host cert with `StrictHostKeyChecking=yes`
    + `@cert-authority` + `HostKeyAlias=live-gw-c3-9a8ce31d.c3.comforsa.iotgw`.
  - Live-phase TOFU is no longer necessary; the install flow can switch to it.
- No image rebuild per new domain: trust comes from the device's domain at boot.

### Negative / follow-ups

- **Per-domain manual steps still exist outside the image.** Creating a domain
  creates its pki-manager zone + CAs (task-080) but **not**:
  1. **the zone's fleet token.** `ssh-ca` needs `PKI_FLEET_TOKENS[zone]` to
     sign. Only `iotgw-lab` and `iotgw-office` had one; `comforsa` and `sabat`
     were minted by hand on 2026-09-23, and `iotgw-production` still has none.
  2. **the bastion's trust**: `scripts/ssh-ca/bastion-trust.sh` must be re-run
     (decision-030).

  **Proposed automation**, a separate task:
  - `ensureDomainPkiZone` also mints the zone-scoped fleet token (it already
    holds the admin OIDC credential) and stores it where the functions read
    it. Today that is an env JSON from SOPS; it should become a Secret/DB
    record the backend can update.
  - The bastion **pulls** trust on a timer from pki-manager's public
    id-addressed CA route (the list of zones comes from a read-only endpoint),
    instead of being pushed by hand.
- **Internet: LAN by default, VPN on request** (added 2026-09-23). The `vpn`
  config is a full tunnel (`AllowedIPs 0.0.0.0/0` + `ip route del default`),
  and the Netmaker hub is an Internet Gateway only for `netmaker` /
  `inetfromusa`. **None of the iotgw networks has it, so a full tunnel has no
  Internet or DNS.** Decided: split tunnel on the live image. Implementation:
  - `vpn` states the device's range in a `# Network:` header (a comment, so
    other consumers are unaffected).
  - `iotgw-bootstrap` keeps the server config (`wg0.server.conf`) and renders
    `wg0.conf` per mode:
    - **`lan` (default):** only the network through `wg0`; default route and
      DNS stay on the LAN, using the resolvers and search domain from
      live-boot's DHCP record (`/run/net-*.conf`).
    - **`vpn`:** the config as delivered, with DNS from its `DNS=` or public
      resolvers through the tunnel.
  - `DNS=` is always lifted out, because the image has no `resolvconf`.
  - The mode is set with the kernel argument `iotgw_internet=`, and at runtime
    with `iotgw-bootstrap internet-via lan|vpn`, which the dashboard's `[i]`
    calls after a y/n prompt warning that `vpn` has no egress today.
  - Installed OpenWRT gateways are unaffected.
  - Making the hub an Internet Gateway per network remains an option if a full
    tunnel is ever required.
- **`live-enroll` ↔ bootstrap contract.** The `live-enroll` response shape
  is a contract with `internal/bootstrap` (`pkiBundle`). Change them together.
- **Boot verification is manual**, as for every image change (task-094): stage,
  boot one machine from the candidate, then `--swap`.

## Related

decision-009 (TOTP envelope), decision-024/026 (SSH-CA architecture and
sequence), **decision-028 §5 (amended here)**, decision-030 (bastion), task-087
(combined bundle, now removed), task-095 (static bake, superseded for this
tree), task-109 (client side — implemented here, as two independent calls).
