# live-image — iotgw live provisioning environment

The Go tooling that turns the PXE live image into an **IoT-gateway provisioning
console**. A gateway booted from the netboot menu provisions itself (VPN + SSH
PKI), and shows its full state on a Bubble Tea dashboard instead of the
Clonezilla menu.

- **Where it runs:** on the live-booted gateway (a Debian / Clonezilla-based
  squashfs held in RAM), **not** in the iotgw-ng cluster.
- **Where it is served:** the netboot host y0 (`10.2.0.3`), tree
  `/opt/stacks/netbootxyz/assets/iotgw-live/`, i.e.
  `http://netboot.joor.net/iotgw-live/`.
- **How it is booted:** the iPXE entry **"IoT gateway live provisioning
  (iotgw-live)"**, in the *Provisioning* group of the menu.
- **Architecture and rationale:**
  [decision-031](../backlog/decisions/) (live image), plus
  [decision-030](../backlog/decisions/) (the Netmaker bastion used to reach
  the gateway).

It is two static binaries built from one Go module
(`github.com/i40sys/iotgw-ng/live-image`):

| Binary | Runs as | Role |
|---|---|---|
| **`iotgw-bootstrap`** | root, once per boot (`iotgw-bootstrap.service`) | provisions the machine: VPN, SSH trust, live host identity; records every step |
| **`iotgw-status`** | the console user (unprivileged) | the operator dashboard on tty1; observes, never re-provisions |

---

## Contents

- [What happens at boot](#what-happens-at-boot)
- [iotgw-bootstrap](#iotgw-bootstrap)
- [Internet via LAN or VPN](#internet-via-lan-or-vpn)
- [iotgw-status (the dashboard)](#iotgw-status-the-dashboard)
- [The state file `/run/iotgw/bootstrap.json`](#the-state-file-runiotgwbootstrapjson)
- [APIs it talks to](#apis-it-talks-to)
- [Files it writes on the live system](#files-it-writes-on-the-live-system)
- [Code layout](#code-layout)
- [Build, test and deploy](#build-test-and-deploy)
- [Operating it on a gateway](#operating-it-on-a-gateway)
- [Troubleshooting](#troubleshooting)
- [Design rules](#design-rules)

---

## What happens at boot

```text
PXE → iPXE "IoT gateway live provisioning" → operator types device username + one-time code
   │    (kernel args: device_id=<name>@<net8>  otp=<6 digits>  [iotgw_internet=lan|vpn]  [iotgw_api=<url>])
   ▼
Linux boot (live-boot, squashfs in RAM)
   │
   ├── start-ocs-live.service → Clonezilla hooks → our S98iotgw-console
   │        replaces the Clonezilla menu launcher in ~user/.bash_profile
   │
   ├── iotgw-bootstrap.service (after network-online)          ── writes /run/iotgw/bootstrap.json
   │      1 identity   device_id + code from /proc/cmdline
   │      2 network    wait until the API is reachable over TCP
   │      3 vpn-fetch  POST vpn API        → WireGuard config         ┐ VPN chain
   │      4 vpn-apply  wg-quick up wg0 (LAN or VPN mode), wait for handshake ┘
   │      5 pki-fetch  POST ssh-ca live-enroll → trust + host cert    ┐
   │      6 user-ca    install User CA + principals                   │ SSH PKI chain
   │      7 host-cert  install the live host certificate              │ (independent of VPN)
   │      8 sshd       sshd -t → reload → verify with sshd -T         ┘
   │
   └── getty@tty1 auto-login `user` → .bash_profile → iotgw-status (once per boot)
             [q] → normal shell      `iotgw-status` → reopen
```

The dashboard starts **immediately**, whether or not the bootstrap has
finished. It shows `PENDING` / `RUNNING` steps and fills in as they complete.
If any step fails, the dashboard is how you find out why.

---

## iotgw-bootstrap

`internal/bootstrap`, `cmd/iotgw-bootstrap`. Runs as root from
`overlay/etc/systemd/system/iotgw-bootstrap.service` (oneshot, 15 min limit,
output to the journal only, never to the console).

### Steps

| # | Step id | Title | What it does | Fails when |
|---|---|---|---|---|
| 1 | `identity` | Device identity | Reads `device_id` / `otp` / `iotgw_api` / `iotgw_internet` from `/proc/cmdline` and validates them; adds the hostname to `/etc/hosts` | No `device_id`, bad format (`<name>@<8 hex>`), code not 6 digits, bad URL |
| 2 | `network` | Physical network | Retries a TCP connect to the API host for up to 90 s. It does **not** require a default route, because the API may be on-link | API unreachable after 90 s |
| 3 | `vpn-fetch` | VPN config fetch | Seals `{device_id, gateway, interface}` with the code and POSTs it to the **vpn** API. Validates the reply as a WireGuard config and saves it verbatim as `wg0.server.conf`. Reads the `# Network:` header | Transport error, non-2xx (the HTTP code is recorded), reply cannot be decrypted, invalid config |
| 4 | `vpn-apply` | VPN configuration | Renders `wg0.conf` for the Internet mode, runs `wg-quick up wg0`, sets DNS, waits up to 25 s for a WireGuard handshake | `wg-quick` fails (FAILED); no handshake (WARNING) |
| 5 | `pki-fetch` | SSH PKI fetch | Ensures an ECDSA host key exists and POSTs `{action: live-enroll, host_pubkey}` to the **ssh-ca** API | Non-2xx, e.g. 401 wrong/expired code, 409 domain has no pki zone, 502 pki-manager (no fleet token) |
| 6 | `user-ca` | User CA install | Writes the domain's User CA, `auth_principals/root` (`iotgw-admin`, `iotgw-ops`), the revoked-keys file and the `60-iotgw-ssh-ca.conf` drop-in | Not a valid public key |
| 7 | `host-cert` | Host certificate | Writes the live host certificate, the `61-iotgw-live-host-cert.conf` drop-in, and the Host CA as `@cert-authority` in `/etc/ssh/ssh_known_hosts` | No certificate in the reply, certificate does not parse |
| 8 | `sshd` | sshd configuration | `sshd -t`, `systemctl reload-or-restart ssh`, then checks with `sshd -T` that `TrustedUserCAKeys` and `HostCertificate` are active | `sshd -t` fails (our drop-ins are removed again), or sshd is not using them |

Rules the runner follows:

- **VPN and PKI are independent chains.** A VPN failure never skips PKI and
  vice versa. A PKI failure marks steps 6–8 `NOT CONFIGURED` with the
  explicit text **"SSH CA configuration MISSING"**, rather than letting you hit
  a mysterious `Permission denied` later.
- **Retries:** transport errors and 5xx are retried (3 attempts, backoff); 4xx
  replies are not, because a rejected code will not start working.
- **sshd drop-ins are written only on success.** A broken PKI step never leaves
  sshd pointing at missing files.
- **The state is written after every transition**, atomically, so the dashboard
  never reads a half-written file.

### Command line

```text
iotgw-bootstrap [-otp CODE] [-state FILE]     provision (what the systemd unit runs)
iotgw-bootstrap internet-via lan|vpn          switch how the Internet is reached (no re-provisioning)
iotgw-bootstrap -version
```

- `-otp` replaces the boot-time code. Codes last 10 minutes (±1 window); if you
  were too slow at the iPXE prompt, take a fresh code from the UI and run
  `sudo iotgw-bootstrap -otp <code>`.
- `-state` defaults to `/run/iotgw/bootstrap.json`.

---

## Internet via LAN or VPN

The vpn API always sends a **full-tunnel** config (`AllowedIPs = 0.0.0.0/0`
plus `PreUp`/`PostDown` that remove and restore the default route).
The bootstrap keeps that config untouched in `wg0.server.conf` and renders
`wg0.conf` for one of two modes:

| | **`lan` (default)** — split tunnel | **`vpn`** — full tunnel |
|---|---|---|
| Through `wg0` | only the device's Netmaker network (e.g. `10.5.0.0/31`) | everything |
| Default route | stays on the physical uplink | via `wg0` (policy routing, table 51820) |
| Internet exits from | the local LAN gateway | the Netmaker hub (e.g. `216.45.62.117`) |
| DNS | the LAN's DHCP resolvers and search domain, captured at boot from live-boot's `/run/net-*.conf` | the config's `DNS=` if present, else `1.1.1.1`, `9.9.9.9` through the tunnel |
| `PreUp`/`PostDown` route hooks | removed | kept, as delivered |

- **Choose at boot** with the kernel argument `iotgw_internet=lan|vpn`.
- **Switch at runtime** with `[i]` in the dashboard (after a y/n prompt), or
  `sudo iotgw-bootstrap internet-via lan|vpn`. The switch restarts `wg0`:
  a few seconds without VPN, and SSH sessions over the VPN drop.
- `DNS=` is always removed from `wg0.conf`, because `wg-quick` would call
  `resolvconf`, which the image does not have. DNS is managed by writing
  `/etc/resolv.conf` directly; nothing else rewrites it on this image.
- **VPN mode needs the hub to be the network's Internet Gateway** (NAT).
  `netmaker-call` sets that up for every network (decision-031).
- **Either way the controller can reach the gateway.** Traffic from the hub
  (`10.5.0.0`) is always inside the tunnelled range.

---

## iotgw-status (the dashboard)

`internal/tui` (Bubble Tea model and views), `internal/collect` (probes),
`cmd/iotgw-status`. Built with the Charm stack: **Bubble Tea** (model/update
loop), **Lip Gloss** (layout and styling), **Bubbles** (viewport, key
bindings).

### Architecture

```text
collectors (internal/collect)          small read-only probes, each with its own timeout,
   host · network · internet ·         returning plain structs — no rendering
   vpn · reachability · pki · bootstrap
        │  run inside tea.Cmd goroutines, never in Update()
        ▼
Bubble Tea model (internal/tui/model.go)   latest struct per collector + what is in flight
        │
        ▼
views (internal/tui/view.go)            Lip Gloss panels, one or two columns, scrollable
```

- **Refresh cadence:**
  - every **3 s**: network, bootstrap state, then VPN and PKI (kernel-local,
    cheap);
  - every **20 s**: Internet and VPN-server reachability (they leave the
    machine);
  - every **60 s**: host facts;
  - `[r]`: everything now.
- **One run in flight per collector**, and every run is bounded by a 20 s
  timeout. A hung DNS lookup or a dead VPN never freezes the screen.
- **Read-only.** The only action that changes the machine is the Internet-mode
  switch (`[i]`), and it runs only after you confirm it.

### Panels

| Panel | Shows |
|---|---|
| **Provisioning** | the 8 bootstrap steps and their status; the panel status is the worst of them, or RUNNING |
| **Host** | hostname, device id, CPU model / arch / CPUs, RAM, kernel, boot source (PXE URL), live-image release, dashboard version, block devices (model, size, removable) |
| **Network** | interfaces with link, IPv4/IPv6, MAC and kind (ethernet / wireguard). Link-less NICs are listed on one line. Also the default gateway, the **actual** Internet egress interface (policy-routing aware, via `ip route get`), and the DNS servers |
| **Internet** | three independent checks: **DNS** (2 names), **IP connectivity** (TCP to `1.1.1.1:443` and `8.8.8.8:53`), **HTTPS** (TLS + HTTP to `cloudflare.com/cdn-cgi/trace`). All pass = HEALTHY, some = WARNING, none = FAILED |
| **VPN (WireGuard / Netmaker)** | Internet mode, DNS in use, config fetched / applied, `wg0` up/down, address, endpoint, last handshake, rx/tx, routes. HEALTHY needs a handshake in the last 3 min |
| **VPN server reachability** | server, resolved IPs, port and protocol (`UDP (WireGuard)`), then DNS, **route** (FAILED if it points *into* the tunnel), ICMP (a WARNING only, since ICMP may be filtered), and the **WireGuard handshake**, which is the real protocol check. There is deliberately **no TCP port probe**: WireGuard is UDP and silent to unauthenticated packets |
| **SSH PKI** | trust domain; **User CA** (requested / received / installed, fingerprint, sshd trust ACTIVE/INACTIVE, principals); **Host CA** (fingerprint, known_hosts); **SSH host identity of this machine**, kept separate from the CA (host key, certificate PRESENT/ABSENT, principals, valid until, signed by, sshd `HostCertificate` ACTIVE/INACTIVE); **sshd** |

A Host CA public key alone gives the machine **no** identity. The host-identity
block turns HEALTHY only when *this* machine's key carries a valid certificate
that sshd is serving.

### Keys

| Key | Action |
|---|---|
| `r` | refresh every collector now |
| `d` | details view: every non-HEALTHY item with its message, endpoint, HTTP status, error and last attempt (`d` or `Esc` to return) |
| `i` | switch Internet via LAN ⇄ VPN (asks `[y]` / `[n]`) |
| `↑ ↓` / `j k`, `PgUp PgDn` / `b` `f` `space`, `ctrl+u` / `ctrl+d` (half page) | scroll |
| `q` / `ctrl+c` | **exit to the shell**: the terminal is restored and the dashboard is *not* restarted |

### Statuses

Every status is a text symbol **and** a word, so the dashboard reads correctly
without colour (Linux console, limited remote terminals):

`[+] HEALTHY` · `[!] WARNING` · `[X] FAILED` · `[.] PENDING` · `[.] RUNNING` ·
`[?] UNKNOWN` · `[-] NOT CONFIGURED` · `[ ] NOT TESTED` · `[-] SKIPPED`

- A probe that cannot read its data (for example `wg show` failing) reports
  **UNKNOWN** with the error. It never guesses a WARNING or FAILED.
- Panels switch from one column to two at a width of **110** columns, long
  values wrap under the value column, and the body scrolls. It works at 80×24.

### Privileges

The dashboard runs as the console user. Only two read-only diagnostics need
root, and they use `sudo -n` (the live image's auto-login user has passwordless
sudo): `wg show wg0 dump` and `sshd -T`. The Internet switch calls
`sudo -n iotgw-bootstrap internet-via …`. All other data comes from
`/proc`, `/sys`, `net.Interfaces()` and the state file.

### Logging

The dashboard logs to **syslog/journald** (tag `iotgw-status`), never to the
terminal it draws on. Read it with `journalctl -t iotgw-status`.

---

## The state file `/run/iotgw/bootstrap.json`

The contract between the two binaries (`internal/state`).

- Lives on tmpfs, so it is gone on reboot.
- World-readable, and **contains no secrets**: no code, no private key.
- Written atomically (temp file + rename).

```jsonc
{
  "identity": { "device_id": "gw-c3@88b97bd9", "has_code": true, "api_base": "http://10.2.0.47:8000" },
  "steps": [
    { "id": "vpn-fetch", "title": "VPN config fetch", "status": "HEALTHY",
      "message": "configuration received for 10.5.0.1/32",
      "endpoint": "http://10.2.0.47:8000/functions/v1/vpn?device_id=gw-c3%4088b97bd9",
      "http_status": 200, "started_at": "…", "finished_at": "…" }
    // … identity, network, vpn-apply, pki-fetch, user-ca, host-cert, sshd
  ],
  "vpn": { "interface": "wg0", "addresses": ["10.5.0.1/32"], "endpoint": "216.45.62.117:443",
           "network_cidr": "10.5.0.0/31", "internet_via": "lan", "dns": ["10.2.10.27"],
           "allowed_ips": ["10.5.0.0/31"], "peer_public_key": "…", "applied_at": "…" },
  "pki": { "zone": "iotgw-comforsa", "domain": "comforsa",
           "user_ca_fingerprints": ["SHA256:…"], "host_ca_fingerprints": ["SHA256:…"],
           "host_fqdn": "live-gw-c3-9a8ce31d.c3.comforsa.iotgw", "host_cert_valid_before": "…" },
  "finished": true
}
```

Status values: `HEALTHY`, `WARNING`, `FAILED`, `PENDING`, `RUNNING`,
`NOT CONFIGURED`, `SKIPPED`.

---

## APIs it talks to

Both calls go through Kong at `iotgw_api` (default `http://10.2.0.47:8000`),
`/functions/v1/<fn>?device_id=<name>@<net8>`. Both use the **same device
envelope**:

- the request body is `openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt`
  keyed with the one-time code (`internal/envelope`, byte-compatible with the
  openssl CLI and the edge functions' `_shared/device-auth.ts`);
- successfully decrypting it *is* the authentication;
- the reply comes back sealed with the same code;
- errors come back as plain JSON.

| Call | Edge function | Returns |
|---|---|---|
| VPN | `vpn` | **only** the WireGuard config, with a `# Network: <cidr>` header |
| SSH PKI | `ssh-ca` with `action: live-enroll` | zone, domain, User CA, Host CA, `@cert-authority` lines, principals, **and a 12 h host certificate** for the live image's per-boot key under `live-<name>-<id8>.<network>.<domain>.iotgw` |

These are deliberately **two independent APIs** (the combined
`vpn?with_ssh_ca=true` was removed). `live-enroll` **never touches the device's
permanent enrollment fields**, so the installed OpenWRT system still performs
its own real enrollment later.

---

## Files it writes on the live system

| Path | Written by | Notes |
|---|---|---|
| `/run/iotgw/bootstrap.json` | bootstrap | the state document |
| `/run/iotgw/resolv.conf.lan` | bootstrap | LAN resolvers captured at boot (for LAN mode) |
| `/run/iotgw/host-ca.pub` | bootstrap | Host CA, used for fingerprints |
| `/etc/wireguard/wg0.server.conf` | bootstrap | the vpn API reply, verbatim (0600) |
| `/etc/wireguard/wg0.conf` | bootstrap | rendered for the Internet mode (0600) |
| `/etc/resolv.conf` | bootstrap | per Internet mode |
| `/etc/hosts` | bootstrap | adds `127.0.1.1 <hostname>` so `sudo` does not stall on DNS |
| `/etc/ssh/ssh-user-ca.pub`, `/etc/ssh/auth_principals/root`, `/etc/ssh/revoked_keys` | bootstrap | User CA trust |
| `/etc/ssh/ssh_host_ecdsa_key-cert.pub` | bootstrap | live host certificate |
| `/etc/ssh/ssh_known_hosts` | bootstrap | `@cert-authority` for the domain's Host CA |
| `/etc/ssh/sshd_config.d/60-iotgw-ssh-ca.conf`, `61-iotgw-live-host-cert.conf` | bootstrap | only on success |
| `~user/.bash_profile` | `S98iotgw-console` (boot hook) | launches the dashboard once per boot |
| `/run/iotgw-console/launched` | `.bash_profile` | per-boot "already shown" marker |

The break-glass drop-in `50-iotgw-authorized-keys.conf` in the image is left as
it is.

---

## Code layout

```text
live-image/
├── cmd/
│   ├── iotgw-bootstrap/main.go   provisioning entry point + `internet-via` subcommand
│   └── iotgw-status/main.go      dashboard entry point (alt screen, syslog logging)
├── internal/
│   ├── state/       /run/iotgw/bootstrap.json schema, atomic read/write, status vocabulary
│   ├── envelope/    device-code envelope (openssl-compatible AES-256-CBC + PBKDF2) + tests
│   ├── bootstrap/   the 8 steps, vpn/ssh-ca client, wg config parser, Internet modes + tests
│   ├── collect/     read-only probes: host, network, internet, vpn, reachability, pki + tests
│   ├── tui/         Bubble Tea model, commands (collectors off the loop), Lip Gloss views + tests
│   ├── netinfo/     /proc/net/route + resolv.conf, no exec + tests
│   ├── sysexec/     bounded command runner: argv only, timeout, capped output, sudo -n helper
│   ├── cmdline/     /proc/cmdline parser
│   └── version/     -ldflags build metadata + /etc/iotgw-live-release
├── overlay/                        files added to the squashfs
│   ├── etc/systemd/system/iotgw-bootstrap.service (+ multi-user.target.wants link)
│   └── etc/ocs/ocs-live.d/S98iotgw-console
├── remove.list                     legacy paths dropped from the image
├── build.sh                        test + build + overlay tarball
└── deploy.sh                       apply to the netboot host (y0) via scripts/live-image/rebuild.sh
```

`remove.list` drops these legacy paths from the image:

- `vpn-setup.service` and `/opt/scripts` (the old `vpn.sh` VPN script);
- `rc.local`, which failed on every boot;
- the task-095 statically baked SSH trust.

Clonezilla's tools stay in the image; only its menu is no longer the default
console UI.

---

## Build, test and deploy

Requirements: Go ≥ 1.24 on the build machine (the image gets binaries only, no
toolchain), and SSH as root to y0.

```bash
cd live-image
go test ./...                 # unit + component tests (envelope vs openssl, parsers, layout, …)
./build.sh                    # vet + test + CGO_ENABLED=0 static binaries + dist/iotgw-live-overlay.tar.gz
./deploy.sh                   # on y0: remove legacy paths, sync overlay, repack → iotgw-live-candidate/ (not served)
./deploy.sh --swap            # install into iotgw-live/ (previous kept as filesystem.squashfs.bak)
./deploy.sh --init            # one-time only (done 2026-09-23): create iotgw-live/ from the Clonezilla VPN-test image
```

- **Version:** `build.sh` stamps it with `git describe`, adding `-dirty` only
  when `live-image/` itself has uncommitted changes. It also writes
  `/etc/iotgw-live-release`. Both are shown in the dashboard and by `-version`.
- **Tarball:** root-owned, with group/other write stripped (`go-w`), so it can
  never loosen `/etc` or `/usr` permissions in the image.
- **`deploy.sh`** wraps [`scripts/live-image/rebuild.sh`](../scripts/live-image/README.md)
  (`--remove`, `--sync-from`, `--stage` / `--swap`). Like every `--sync-from`,
  it changes the tree's `squashfs-root/` in place.
- **Rollback:** on y0,
  `mv iotgw-live/filesystem.squashfs.bak iotgw-live/filesystem.squashfs`.

### Fast iteration without rebuilding the image

On a live-booted gateway you can replace the binaries in RAM. They are lost on
reboot:

```bash
scp dist/overlay/usr/local/bin/iotgw-* root@<gateway>:/usr/local/bin/
ssh root@<gateway> 'iotgw-bootstrap -otp <current code>'   # re-provision
```

---

## Operating it on a gateway

| Need | Do |
|---|---|
| See the state | the dashboard on tty1, or `iotgw-status` from any shell |
| Get a shell | `q` in the dashboard |
| Why did X fail? | `d` in the dashboard; full log: `journalctl -u iotgw-bootstrap` |
| The boot-time code had expired | `sudo iotgw-bootstrap -otp <code from the UI>` |
| Internet through the LAN / the VPN | `i` in the dashboard, or `sudo iotgw-bootstrap internet-via lan|vpn` |
| Raw state | `jq . /run/iotgw/bootstrap.json` |
| Versions | `iotgw-status -version`, `cat /etc/iotgw-live-release` |
| Tunnel details | `sudo wg show`, `ip route`, `ip rule` |

From the controller side the gateway is reached **through the Netmaker
bastion**, `iotgw-jump@216.45.62.117` (decision-030). The client can verify the
live host certificate strictly:
`@cert-authority` + `HostKeyAlias=live-<name>-<id8>.<net>.<domain>.iotgw`.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Identity FAILED | booted a menu entry without the username/code prompt, or mistyped `name@net8` |
| VPN config fetch FAILED, HTTP 401 | the code expired or the counter was reset in the UI → `sudo iotgw-bootstrap -otp <new code>` |
| SSH PKI fetch FAILED, HTTP 409 | the device's domain has no pki-manager zone (backend `provisionPkiZone`) |
| SSH PKI fetch FAILED, HTTP 502 "No fleet token" | the zone has no entry in `PKI_FLEET_TOKENS` (manual per domain today) |
| VPN WARNING "no handshake" | UDP to the hub blocked, or the device's keys are not on the hub |
| Internet FAILED in VPN mode | the hub is not the network's Internet Gateway → provision a device in that network, or set it in Netmaker |
| VPN / sshd values UNKNOWN | `sudo -n` not allowed for the console user, or it stalled; the note shows the error |

---

## Design rules

These are the decisions behind the code (decision-031), kept here so changes
respect them:

1. **VPN configuration API ≠ SSH PKI configuration API.** Two calls, two
   independent step chains, separately diagnosable.
2. **The live host identity is separate from the permanent enrollment.** A
   `live-…` FQDN and a 12 h certificate; the device row is never written.
3. **The dashboard observes, it does not provision.** No provisioning API
   calls on refresh; the only mutation is the confirmed Internet switch.
4. **Failures are explicit and the UI always starts.** Every step records what
   went wrong, and the dashboard renders even when everything failed.
5. **No blocking work in the Bubble Tea loop.** Collectors are commands with
   timeouts; one run in flight each.
6. **Safe system calls.** Explicit argv (never a shell string), timeouts,
   capped output, validated results (`internal/sysexec`).
7. **Probes test fresh state.** For example, the HTTPS probe opens a new
   connection on every run. A kept-alive connection surviving a route change
   once reported a false HTTPS failure.
8. **Readable without colour.** Every status carries text, not only colour.
