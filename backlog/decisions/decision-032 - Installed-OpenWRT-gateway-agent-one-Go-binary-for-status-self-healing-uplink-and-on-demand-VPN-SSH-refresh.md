---
id: decision-032
title: >-
  032: Installed-OpenWRT gateway agent: one Go binary for status, self-healing
  uplink and on-demand VPN/SSH refresh
date: '2026-09-24 06:58'
status: accepted
---
## Context

After the `install` flow, the gateway boots its own OpenWRT and the **VPN is the
only remote management path** (the controller reaches it through the Netmaker
host, decision-030). That path is currently written **once, statically**:

| Writer | What it writes |
|---|---|
| `setup_vpn.sh` (install, `d01_install_owrt.yml`) | `wg0` interface + peer, and a pinned route to the Netmaker server via `ip_route_default_gw` parsed from the live host's `wg0.conf` |
| `templates/network.j2` (provisioning, `tasks/system.yaml`) | the same `wg0` + the same pinned route with `option gateway '{{ ip_route_default_gw }}'` |

Observed on `gw-c3` (2026-09-24): the live image's `wg0.conf` has no
`ip route add … via` line, so the gateway was empty and the route became
on-link (`216.45.62.117 dev eth0 scope link`). The endpoint was ARPed on the
LAN, the handshake never left, `wg0` stayed down, and the gateway was
unreachable from the controller. `setup_vpn.sh` was patched to skip the route
when no gateway is known (iotgw-kestra `66dfeb2`); `network.j2` still has the
problem.

More generally, any value baked at install time (router address, DHCP lease,
site) goes stale when the site or LAN changes, and the gateway then loses its
only management path with no way to repair itself. Recovering a half-failed
VPN or SSH-CA step today means reinstalling.

The live image already has the needed logic in Go (decision-031):
`iotgw-bootstrap` (VPN fetch/apply, SSH-CA `live-enroll`, fail-safe sshd reload,
`internet-via lan|vpn`) and `iotgw-status` (Bubble Tea dashboard, read-only
collectors, `[i]` LAN ⇄ VPN switch). It targets Debian (systemd, `wg-quick`,
`/etc/resolv.conf`, `sudo`), not OpenWRT.

## Decision

### 1. One Go binary, subcommands

Evolve the live-image Go module into **a single binary** (working name `iotgw`)
used on both the live image and the installed OpenWRT. One codebase, one
release, one pinned version per gateway. The daemon and the dashboard may be
separate processes, but they run the **same binary** with different arguments.
Conceptually:

```text
iotgw status                      console dashboard (read-mostly)
iotgw daemon                      background agent (monitor + self-heal)
iotgw vpn status | vpn refresh
iotgw ssh status | ssh refresh
iotgw internet lan | vpn | auto
iotgw hold enable | hold disable
```

Final names are settled during implementation, reusing the current code.
`iotgw-bootstrap` / `iotgw-status` on the live image become modes of the same
binary (compat aliases allowed).

### 2. Platform layer

Functional logic is common; system changes go through a platform interface with
two implementations (conceptually `NetworkManager` → `LiveImage…` /
`OpenWRT…`):

| Concern | Live image | OpenWRT |
|---|---|---|
| Network, routes, WireGuard | `ip`, `wg-quick` | `uci` + netifd (`ubus`, `ifup`/reload) |
| DNS | `/etc/resolv.conf` | `dnsmasq` via UCI |
| Services | systemd | procd init scripts |
| Privilege | console user + `sudo -n` | root |
| Logs | journald | `logger` / logd |
| Persistent config | — (tmpfs) | `/etc/config/iotgw` |
| Runtime state | `/run/iotgw/` | `/var/run/iotgw/` |

Files that OpenWRT regenerates are never edited directly.

### 3. Console dashboard on the installed system

`iotgw status` runs at boot on the OpenWRT console (screen **and** serial) with
the live image's panels. **Provisioning** becomes **Installed** and shows at
least: installed, provisioned, valid SSH host certificate, VPN status, Internet
status, active uplink (LAN/VPN).

### 4. Self-healing daemon

`iotgw daemon` runs permanently. At boot and periodically (≈ every minute):

1. detect the LAN uplink;
2. detect the current LAN router;
3. check DNS, IP connectivity and HTTPS;
4. check the WireGuard handshake;
5. check that the Netmaker server is reachable.

It **owns the pinned route to the Netmaker server** and keeps it pointed at the
current LAN router (replacing the install-time static route), and applies the
Internet policy. **An automatic change must never leave the gateway without a
working egress path.**

### 5. Internet policy (persistent)

`/etc/config/iotgw` → `internet_policy = lan | vpn | auto`.
**Default: LAN preferred, automatic fallback to VPN.** `[i]` in the dashboard
and `iotgw internet …` change it and it survives reboots (on the live image it
stays per-boot).

### 6. On-demand refresh (no reboot, no reinstall)

- **`vpn refresh`** — re-request the WireGuard/Netmaker config from the `vpn`
  API, update keys/peer/params, apply through UCI, reload only what is needed,
  validate the handshake + egress, roll back on failure.
- **`ssh refresh`** — re-request SSH trust and the host certificate from the
  `ssh-ca` API (`enroll`, with the task-075 continuity signature from the
  current host key), write the files, `sshd -t`, prefer **reload**, fall back to
  restart, verify sshd is serving, roll back on failure.

The gateway is a **client** of the central provisioning / pki-manager (the
authority); no PKI logic lives on the device.

### 7. Transactions and safety

Every change to networking, VPN or SSH is transactional: snapshot → apply →
verify (egress + VPN / sshd) → commit, else restore the snapshot automatically
(the pattern already used for the safe sshd reload). Plus: a rate limit on
automatic changes, no LAN ⇄ VPN flapping (hysteresis), backoff after repeated
failures.

### 8. Hold mode

`iotgw hold enable|disable` (persistent in `/etc/config/iotgw`). While on hold
the daemon keeps monitoring and recording state but makes **no** automatic
change to networking, routes, VPN or SSH. The dashboard shows hold
prominently: that it is active, since when, and that automatic repair is
suspended. Manual subcommands still work.

### 9. Configuration ownership

| Owner | Responsibility |
|---|---|
| Provisioning / Ansible | WireGuard private key, peer, initial bring-up data; initial SSH-CA enrollment |
| `iotgw` agent | LAN gateway detection, the Netmaker route, uplink choice, connectivity upkeep, recovery from router/DHCP changes, VPN/SSH refresh, validation and rollback |

The fixed route is removed from `setup_vpn.sh` and `templates/network.j2` once
the agent ships.

### 10. Delivery

The static `x86_64` binary is already built by the live-image CI.
`d01_install_owrt.yml` copies the binary, `/etc/config/iotgw`, the procd init
script and the console entry into the installed rootfs, at an **explicitly
pinned version**.

## Consequences

- An installed gateway can keep and recover its own management path after
  router/DHCP/site changes, and a failed VPN or SSH step is fixed with one
  command instead of a reinstall.
- The Go module grows a platform layer and a daemon; the live image keeps
  working through the same binary.
- Ansible stops writing routes; until then, `network.j2` can still write an
  empty-gateway route (interim guard tracked as a task).
- A CI job must boot OpenWRT `x86_64` (decision-029 QEMU approach) to test the
  recovery cases.

### Open points (resolve during implementation)

- **Refresh authentication.** The device TOTP is derived from non-secret
  identifiers (`<domain>-<network>-<device>-<counter>`). `ssh refresh` can rely
  on the task-075 host-key continuity proof; `vpn refresh` returns the
  WireGuard private key and has no equivalent proof yet. Options: operator
  one-time code (as `iotgw-bootstrap -otp`), or add host-key proof to the `vpn`
  function. Automatic (unattended) `vpn refresh` needs the latter.
- Default intervals, rate limits and hysteresis values.
- Whether the daemon reports status to the platform (deferred).

## Related

- decision-024..028 (SSH-CA), decision-029 (QEMU boot/install simulation),
  decision-030 (Netmaker host as bastion), decision-031 (live image Go tooling)
- task-075 (re-enrollment continuity proof)
