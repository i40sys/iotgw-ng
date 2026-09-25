# live-image — iotgw live provisioning environment

Go tooling that turns a PXE-booted Debian **live image** (Clonezilla-based
squashfs) into an **IoT-gateway provisioning console**. A gateway booted from
the netboot menu provisions itself (VPN and SSH PKI), then shows its full state
on a Bubble Tea dashboard instead of the Clonezilla menu.

- **Where it runs:** on the live-booted gateway, in RAM. It is not part of the
  iotgw-ng cluster; it talks to the platform's edge functions over HTTP.
- **How it gets there:** its binaries and a small rootfs overlay are added to
  the live image's squashfs, which a netboot server (netboot.xyz layout)
  serves to the iPXE menu entry that asks for the device credentials.
- **Architecture and rationale:** decision-031 (live image) and decision-030
  (reaching gateways through the VPN hub as an SSH bastion), in
  [`backlog/decisions/`](../backlog/decisions/).

It is **one static binary, `iotgw`**, built from one Go module
(`github.com/i40sys/iotgw-ng/live-image`), with modes as subcommands
(decision-032). The same binary also runs on the **installed OpenWRT
gateway** — see [Installed OpenWRT gateway](#installed-openwrt-gateway-decision-032).
On the live image it is also installed as two symlinks, so the boot flow and
muscle memory are unchanged:

| Name on the live image | = | Runs as | Role |
|---|---|---|---|
| **`iotgw-bootstrap`** | `iotgw bootstrap` | root, once per boot (`iotgw-bootstrap.service`) | provisions the machine: VPN, SSH trust, live host identity; records every step |
| **`iotgw-status`** | `iotgw status` | the console user (unprivileged) | the operator dashboard on tty1; observes, never re-provisions |

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
- [Installed OpenWRT gateway (decision-032)](#installed-openwrt-gateway-decision-032)
- [Build, test and deploy](#build-test-and-deploy)
- [Operating it on a gateway](#operating-it-on-a-gateway)
- [Troubleshooting](#troubleshooting)
- [Design rules](#design-rules)

---

## What happens at boot

```text
PXE → iPXE "IoT gateway live provisioning" → operator types device username + one-time code
   │    (kernel args: device_id=<name>@<net8>  otp=<6 digits>  iotgw_api=<url>  [iotgw_internet=lan|vpn])
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
| 1 | `identity` | Device identity | Reads `device_id` / `otp` / `iotgw_api` / `iotgw_internet` from `/proc/cmdline` and validates them; upgrades an `http://` API URL to `https://` (pinned CA, see [TLS](#tls-to-the-device-api-pinned-ca)) and records the **effective** URL as `identity.api_base`; adds the hostname to `/etc/hosts` | No `device_id`, bad format (`<name>@<8 hex>`), code not 6 digits, no API URL (neither `iotgw_api=` nor a build-time `API_BASE`), bad URL |
| 2 | `network` | Physical network | Retries a TCP connect to the API host for up to 90 s. It does **not** require a default route, because the API may be on-link | API unreachable after 90 s |
| 3 | `vpn-fetch` | VPN config fetch | Uses this boot's WireGuard key pair (generated on the first fetch of a boot, kept 0600 in `/run/iotgw/wg0.key`; `iotgw vpn refresh -rotate-key` makes a new one — decision-035 §2). Generates a one-off X25519 reply key, seals `{device_id, gateway, interface, wg_public_key, reply_key}` with the code and POSTs it to the **vpn** API; opens the reply sealed to that key (decision-033 §4; a legacy code-encrypted reply is still accepted). The reply has no `PrivateKey` line: the bootstrap inserts its own key (a server that still sends one is obeyed, as before). Validates it as a WireGuard config and saves it as `wg0.server.conf`. Reads the `# Network:` header | Transport error, non-2xx (the HTTP code is recorded), reply cannot be opened, invalid config |
| 4 | `vpn-apply` | VPN configuration | Renders `wg0.conf` for the Internet mode, runs `wg-quick up wg0`, sets DNS, waits up to 25 s for a WireGuard handshake | `wg-quick` fails (FAILED); no handshake (WARNING) |
| 5 | `pki-fetch` | SSH PKI fetch | Ensures an ECDSA host key exists and POSTs `{action: live-enroll, host_pubkey}` to the **ssh-ca** API | Non-2xx, e.g. 401 wrong/expired/already-used code, 429 too many wrong codes, 409 domain has no pki zone, 502 pki-manager (no fleet token) |
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
- **One code, two uses.** The boot-time code is presented once to `vpn` and
  once to `ssh-ca live-enroll`; the server consumes it **per purpose**, so both
  succeed, and neither accepts it again (decision-033 §3).
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

- `-otp` replaces the boot-time code. Codes are **single use** and last
  10 minutes (±1 window); if you were too slow at the iPXE prompt, or want to
  re-run a step (`iotgw vpn refresh` / `iotgw ssh refresh` on the live image
  re-use the boot-time code otherwise, which the server has already consumed),
  take a fresh code from the device page in the UI and pass it with `-otp`.
- `-state` defaults to `/run/iotgw/bootstrap.json`.

---

## Internet via LAN or VPN

The vpn API always sends a **full-tunnel** config (`AllowedIPs = 0.0.0.0/0`
plus `PreUp`/`PostDown` that remove and restore the default route).
The bootstrap keeps that config untouched in `wg0.server.conf` and renders
`wg0.conf` for one of two modes:

| | **`lan` (default)** — split tunnel | **`vpn`** — full tunnel |
|---|---|---|
| Through `wg0` | only the device's Netmaker network (from the config's `# Network:` header) | everything |
| Default route | stays on the physical uplink | via `wg0` (policy routing, table 51820) |
| Internet exits from | the local LAN gateway | the Netmaker hub (the network's Internet Gateway) |
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
  (its address in the network) is always inside the tunnelled range.

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
  "identity": { "device_id": "gw-01@1a2b3c4d", "has_code": true, "api_base": "http://api.example:8000" },
  "steps": [
    { "id": "vpn-fetch", "title": "VPN config fetch", "status": "HEALTHY",
      "message": "configuration received for 10.8.0.3/32",
      "endpoint": "http://api.example:8000/functions/v1/vpn?device_id=gw-01%401a2b3c4d",
      "http_status": 200, "started_at": "…", "finished_at": "…" }
    // … identity, network, vpn-apply, pki-fetch, user-ca, host-cert, sshd
  ],
  "vpn": { "interface": "wg0", "addresses": ["10.8.0.3/32"], "endpoint": "vpn-hub.example:443",
           "network_cidr": "10.8.0.0/24", "internet_via": "lan", "dns": ["192.168.1.1"],
           "allowed_ips": ["10.8.0.0/24"], "peer_public_key": "…", "applied_at": "…" },
  "pki": { "zone": "iotgw-acme", "domain": "acme",
           "user_ca_fingerprints": ["SHA256:…"], "host_ca_fingerprints": ["SHA256:…"],
           "host_fqdn": "live-gw-01-5e6f7a8b.plant-a.acme.iotgw", "host_cert_valid_before": "…" },
  "finished": true
}
```

Status values: `HEALTHY`, `WARNING`, `FAILED`, `PENDING`, `RUNNING`,
`NOT CONFIGURED`, `SKIPPED`.

---

## APIs it talks to

Both calls go to the platform's API gateway (Kong) at `iotgw_api`,
`/functions/v1/<fn>?device_id=<name>@<net8>`. Both use the **same device
envelope** (decision-033):

- the one-time code comes from the **operator** (typed at the iPXE prompt →
  `otp=`, or `-otp`). It is computed only by the backend, from a random
  per-device seed held in the KMS; nothing on the gateway can derive it. Each
  code is accepted **once per purpose**, and 5 wrong codes lock the device's
  code endpoints for 15 min (HTTP 429);
- the request body is `openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt`
  keyed with the code (`internal/envelope`, byte-compatible with the openssl
  CLI and the edge functions' `_shared/device-auth.ts`); successfully
  decrypting it *is* the authentication;
- the **vpn** reply is sealed to a one-off X25519 key the request carries
  (`reply_key`; `internal/seal`: X25519 → HKDF-SHA256 → AES-256-GCM, AAD =
  `device_id`), so a recorded exchange never yields the WireGuard private key
  even if the 6-digit code is brute-forced. A server that predates it answers
  with the legacy code-encrypted reply, still accepted;
- the **ssh-ca** reply comes back sealed with the code (it is public material);
- errors come back as plain JSON.

| Call | Edge function | Returns |
|---|---|---|
| VPN | `vpn` | **only** the WireGuard config, with a `# Network: <cidr>` header |
| SSH PKI | `ssh-ca` with `action: live-enroll` | zone, domain, User CA, Host CA, `@cert-authority` lines, principals, **and a 12 h host certificate** for the live image's per-boot key under `live-<name>-<id8>.<network>.<domain>.iotgw` |

### TLS to the device API (pinned CA)

decision-035 §1: the device API is served over HTTPS by the kind ingress with a
certificate from a dedicated **device-API CA**, whose certificate (public) is
`/etc/iotgw/api-ca.pem` — in the live overlay and in the OpenWRT package
(`overlay/etc/iotgw/api-ca.pem`). The client (`internal/devapi`):

| API URL | `/etc/iotgw/api-ca.pem` (OpenWRT: uci `iotgw.main.api_ca`) | Effect |
|---|---|---|
| `https://…` | exists | trusts **only** that CA (pinned) |
| `https://…` | missing | system CA roots |
| `http://host:port/path` | exists | **upgraded** to `https://host/path` (default port 443 — the `:8000` is Kong's plain-HTTP NodePort) and pinned; never falls back to HTTP — a failure names both URLs |
| `http://…` | missing | plain HTTP, as before |

The upgrade exists because the iPXE menu still passes
`iotgw_api=http://10.2.0.47:8000`. The live image records the effective
(https) URL in `bootstrap.json` → `identity.api_base`, which the install flow
copies into the installed gateway's `/etc/config/iotgw`. A CA file that exists
but holds no certificate is an error (fail closed). The build-time
`DefaultAPIBase` (`API_BASE`) stays overridable; the same rules apply to it.

### WireGuard key held by the gateway

decision-035 §2: the gateway generates its WireGuard key pair and sends only
`wg_public_key` (inside the code-sealed request); the vpn function moves the
Netmaker client to that key when it differs and returns the config **without**
a `PrivateKey` line (`# PrivateKey: held by the gateway`); the gateway inserts
its own key before applying. The live image makes one key per boot; an
installed gateway **reuses** `network.wg0.private_key`, so a refresh normally
changes nothing on Netmaker and the transactional rollback (which restores
that same key) stays valid. `iotgw vpn refresh -otp CODE -rotate-key` makes a
new key explicitly. The private key is never logged, printed or sent.

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
| `/run/iotgw/wg0.key` | bootstrap | this boot's WireGuard private key (0600; never logged or sent) |
| `/etc/wireguard/wg0.server.conf` | bootstrap | the vpn API reply, completed with this boot's `PrivateKey` (0600) |
| `/etc/wireguard/wg0.conf` | bootstrap | rendered for the Internet mode (0600); keeps the `PrivateKey = …` line the install flow's `setup_vpn.sh` reads |
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
├── cmd/iotgw/main.go   the single binary (dispatch in internal/cli)
├── internal/
│   ├── cli/         subcommands; argv[0] iotgw-bootstrap / iotgw-status compatibility
│   ├── agent/       installed-OpenWRT agent: /etc/config/iotgw, daemon, policy engine,
│   │                transactions + rollback, vpn/ssh refresh, Installed panel data + tests
│   ├── platform/    live image vs OpenWRT: service state, sshd reload/restart
│   ├── uci/         `uci` CLI client, show parser, config snapshots + tests
│   ├── iproute/     text `ip route` parser (iproute2 and BusyBox) + tests
│   ├── devapi/      vpn / ssh-ca client (code envelope, sealed vpn reply, plain renew) + tests
│   ├── seal/        sealed vpn reply: X25519 + HKDF-SHA256 + AES-256-GCM (decision-033) + tests
│   ├── wgconf/      wg-quick config parser + tests
│   ├── state/       /run/iotgw/bootstrap.json schema, atomic read/write, status vocabulary
│   ├── envelope/    device-code envelope (openssl-compatible AES-256-CBC + PBKDF2) + tests
│   ├── bootstrap/   the 8 live-image steps, Internet modes, RunVPN / RunPKI + tests
│   ├── collect/     read-only probes: host, network, internet, vpn, reachability, pki + tests
│   ├── tui/         Bubble Tea model, commands (collectors off the loop), Lip Gloss views + tests
│   ├── netinfo/     /proc/net/route + resolv.conf, no exec + tests
│   ├── sysexec/     bounded command runner: argv only, timeout, capped output, sudo -n helper
│   ├── cmdline/     /proc/cmdline parser
│   └── version/     -ldflags build metadata + /etc/iotgw-live-release
├── overlay/                        files added to the squashfs
│   ├── etc/systemd/system/iotgw-bootstrap.service (+ multi-user.target.wants link)
│   └── etc/ocs/ocs-live.d/S98iotgw-console
├── openwrt/overlay/                files of the installed-OpenWRT package
│   ├── etc/init.d/iotgw            procd service: `iotgw daemon`
│   └── usr/libexec/iotgw-console   tty1 / serial launcher: `iotgw status`, then login
├── test/
│   ├── fakeapi/                    vpn + ssh-ca stand-in (own seed, single-use codes, sealed reply, renew) + tests
│   └── qemu/run.sh                 end-to-end test on two OpenWRT VMs
├── remove.list                     legacy paths dropped from the image
└── justfile                        check · build · overlay · openwrt · dist · deploy-* (see below)
```

`remove.list` drops these legacy paths from the image:

- `vpn-setup.service` and `/opt/scripts` (the old `vpn.sh` VPN script);
- `rc.local`, which failed on every boot;
- the task-095 statically baked SSH trust.

Clonezilla's tools stay in the image; only its menu is no longer the default
console UI.

---

## Installed OpenWRT gateway (decision-032)

After the `install` flow the gateway boots its own OpenWRT, and the VPN is its
**only** remote management path. The same `iotgw` binary keeps that path
working there. The install playbook (iotgw-kestra `tasks/iotgw_agent.yaml`)
extracts the pinned `iotgw-openwrt-linux-amd64.tar.gz` into the new rootfs and
writes `/etc/config/iotgw` (device identity from the flow + the live image's
`api_base`).

| Piece | What it does |
|---|---|
| `iotgw daemon` (`/etc/init.d/iotgw`, procd) | every `check_interval` (60 s): finds the uplink and the **current** LAN router (`ubus`), probes Internet out of the uplink and out of the tunnel (`SO_BINDTODEVICE`), the WireGuard handshake and the route to the Netmaker server; keeps `network.iotgw_endpoint` (the Netmaker /32) on the current router, routes the Netmaker network through `wg0`, and applies the Internet policy |
| `iotgw status` on tty1 + serial | the live image's panels, with **Installed** (installed / provisioned / SSH certificate / VPN / Internet / active uplink) and **Self-healing agent** instead of Provisioning; `[i]` chooses the policy, `[h]` toggles hold, `[v]` asks for the 6-digit one-time code (inline: digits, Backspace, Enter runs, Esc cancels) and runs a VPN refresh, `[s]` renews the SSH certificate with the host key after a `y`/`f` (force) confirmation — or, on a gateway not enrolled yet, asks for the code and enrolls; `[r]` refreshes and fully repaints. The code never reaches a log: the command line shown is `iotgw vpn refresh -otp ******`. Every action asks first and is then **followed live** in an *Action* panel: the command, elapsed time, each output line as it is written (timestamped, stderr marked `!`), and the result — so a failure can be diagnosed at the console; `[d]` Details keeps the whole output. The launcher waits for the boot to settle and keeps kernel messages off the console while the dashboard owns it; the screen is also fully repainted every 60 s |
| `iotgw internet lan\|vpn\|auto` | persistent policy in `/etc/config/iotgw`. `auto` (default) = LAN preferred, automatic fallback to VPN; `lan`/`vpn` pin the path (applied at once) |
| `iotgw hold enable [-reason …]\|disable\|status` | freeze automatic changes; the daemon keeps monitoring and records what it would have done. A banner on the dashboard says so |
| `iotgw vpn refresh -otp CODE [-rotate-key]` | re-request the WireGuard config from `vpn` (reply sealed to a one-off key), apply it through UCI, keep it only if the tunnel comes up. The code is **required**. Sends only the public key of the gateway's own `network.wg0.private_key` and inserts that key into the reply (decision-035); `-rotate-key` generates a new key pair |
| `iotgw ssh refresh [-otp CODE] [-force]` | **enrolled** (host certificate installed): `renew` — plain JSON signed by the host key (SSHSIG, namespace `iotgw-renew`), **no code**; skipped while the certificate is current unless `-force`. **Not enrolled**: `enroll` with the operator's code (required). Then `sshd -t`, reload (restart fallback), verify sshd serves them — or restore every file. A 409 means the server already has a host key for the device (a reinstall): use **Reset SSH enrollment** in the UI first |
| SSH self-renewal (daemon) | when the host certificate nears expiry (< 30 days) the daemon renews it by itself with the host key (at most once per hour, suspended by hold). It **never** enrolls (no code) and never calls `vpn` |

**One backend, three faces.** The daemon also publishes the full status
(host, network, Internet, VPN, reachability, SSH PKI, the Installed/agent
picture) to `/var/run/iotgw/status.json` — every 5 s, the probes that leave
the machine every 30 s, and at once on SIGUSR1. The console dashboard, the
LuCI page and `iotgw rpcd` only **read** that snapshot (the dashboard probes
by itself only if it is stale, i.e. the daemon is down), and all actions go
through the same code as the CLI. So `[q]` on the console closes just the
viewer: the daemon keeps running and repairing; two consoles (tty1 + serial)
no longer probe the system twice.

**LuCI: Status → IoGW NG** (OpenWRT 23.05, client-side LuCI). Same panels
and actions as the console (policy, hold, VPN refresh with the **required**
one-time code, SSH refresh with a code only for a first enrollment, history). How it talks to the system — the standard LuCI way
on this version, no CGI:

```text
browser ──JSON-RPC──► uhttpd /ubus ──► rpcd ──exec──► /usr/libexec/rpcd/iotgw
   view/iotgw/status.js                (ACL: acl.d/luci-app-iotgw.json)   = iotgw rpcd list|call <method>
```

| ubus `iotgw` method | Does |
|---|---|
| `status` | the daemon's snapshot + recent manual jobs |
| `refresh` | SIGUSR1 to the daemon: a full status round now |
| `hold {enable, reason}` | hold on/off (immediate) |
| `set_policy {policy}`, `vpn_refresh {otp, rotate_key}` (otp required), `ssh_refresh {otp, force}` (otp optional) | start a **background job** (they can outlast rpcd's 30 s exec timeout); returns a job id |
| `job {id}` | the job's output and exit code (the page polls it) |

Files: `/usr/share/luci/menu.d/luci-app-iotgw.json` (menu entry),
`/usr/share/rpcd/acl.d/luci-app-iotgw.json` (read: status, job; write: the
actions), `/usr/libexec/rpcd/iotgw`, `/www/luci-static/resources/view/iotgw/status.js`
— all in the `iotgw-openwrt` package. After installing them by hand run
`/etc/init.d/rpcd restart; rm -rf /tmp/luci-*cache*`. A lock
(`/var/run/iotgw/change.lock`) serializes the daemon's changes with manual ones.

**Every change is a transaction**: snapshot `/etc/config/network` (or the SSH
files), apply, `ubus call network reload`, verify for up to 45 s, and restore
the snapshot if the gateway lost Internet or the tunnel. Automatic changes are
rate-limited (3 per 15 min), back off after failures (1 → 30 min), and move the
egress only after 3 consecutive checks agree (no LAN ⇄ VPN flapping) and never
onto a path that is not working.

**Egress mechanics**: the uplink's default route keeps metric 0 and `wg0`'s
default route metric 5 (LAN wins). For VPN egress the agent sets the uplink's
metric to 20, so `wg0` wins while the pinned /32 keeps the tunnel itself on the
LAN router. DNS stays with dnsmasq.

**Refresh authentication** (decision-033): the gateway **cannot compute a
one-time code** — codes come from a random per-device seed that only the
backend reads, and the operator takes the current one from the device page in
the UI (`-otp`, console, LuCI). A code works **once** per purpose; if it was
used (or the reply was lost) the UI offers the next one, and **Reset code**
rotates the seed. The VPN is always operator-driven (`vpn refresh` needs the
code); an enrolled gateway renews its SSH certificate with its **host key**
(no code), which is also how the daemon renews by itself. The legacy identity
keys (`device_uuid`, `network_id`, `domain_id`, `totp_counter`) may still be in
`/etc/config/iotgw` from older installs; they are read but never used for
authentication. Agents ≤ v0.2.2 derive codes and can no longer refresh.

**Root password (accepted gap, task-127):** the install leaves root with an
**empty password**; the provisioning `system` stack sets it (`root_password`).
Until a gateway is provisioned, anyone on its LAN can log in to LuCI as root,
so provision right after installing.

Files: `/etc/config/iotgw` (config, 0600), `/var/run/iotgw/agent.json`
(daemon state, history), `/etc/iotgw/wg0.server.conf` (the vpn reply completed
with the gateway's own key, 0600), `/etc/iotgw/api-ca.pem` (the pinned
device-API CA, from the package; uci `iotgw.main.api_ca` overrides the path).
Logs: `logread -e iotgw` (or `/var/log/messages` once provisioning installed
rsyslog — the dashboard detects `/usr/sbin/rsyslogd` and shows the right one).

**End-to-end test**: `just e2e` boots two OpenWRT 23.05 VMs (a LAN router +
WireGuard hub whose endpoint is off-LAN, and a gateway installed with the
gw-c3 on-link route) and checks route repair, router change, LAN→VPN fallback
and return, hold, policy across reboot, vpn refresh (code required and single
use, sealed reply, rollback; over HTTPS with a pinned throwaway test CA after
the http→https upgrade, and refused with another CA; the gateway keeps its
WireGuard key across a refresh, Netmaker — the hub's peer, via
`fakeapi -netmaker-hook` — follows a changed key, `-rotate-key` makes a new
one, and no private key reaches the log or the server), ssh refresh (enroll with a code, renew by host
key, 409 after a "reinstall", daemon self-renewal), LuCI/rpcd, and the
console dashboard. The fake API (`test/fakeapi`) holds its own seed and
exposes the current code at `/test/code` — the test's stand-in for the UI. It uses KVM when `/dev/kvm` is writable, TCG otherwise.

---

## Build, test and deploy

Everything goes through the [`justfile`](justfile). Run `just --list` inside
`live-image/`, or `just live-image::` from the repo root.

Requirements: Go (version from `go.mod`) and [`just`](https://github.com/casey/just).
The image gets **binaries only**, no Go toolchain.

| Recipe | Does |
|---|---|
| `just check` | gofmt check, `go vet`, unit + component tests |
| `just build [arch]` | the static `CGO_ENABLED=0` `iotgw` binary for `linux/<arch>` (default `amd64`) into `dist/<arch>/` |
| `just overlay [arch]` | live-image rootfs overlay `dist/iotgw-live-overlay-linux-<arch>.tar.gz`: `iotgw` + its two symlinks, `overlay/`, `/etc/iotgw-live-release` |
| `just openwrt [arch]` | installed-OpenWRT package `dist/iotgw-openwrt-linux-<arch>.tar.gz`: `/usr/sbin/iotgw`, `/etc/init.d/iotgw`, `/usr/libexec/iotgw-console`, the LuCI page, `/etc/iotgw/api-ca.pem` |
| `just dist` | `check`, then binaries, overlays and OpenWRT packages for **amd64 and arm64**, `remove.list`, `SHA256SUMS`. This is what CI publishes |
| `just e2e` | the QEMU end-to-end test of the OpenWRT agent (`test/qemu/run.sh`) |
| `just version` | the version the build stamps (`git describe`, `-dirty` only for changes under `live-image/`) |
| `just clean` | remove `dist/` |

Build variables, all overridable (`just VERSION=1.2.3 API_BASE=https://api.example dist`):

| Variable | Meaning |
|---|---|
| `VERSION`, `COMMIT` | stamped into both binaries and `/etc/iotgw-live-release` |
| `API_BASE` | optional default API URL baked into `iotgw-bootstrap`. The kernel argument `iotgw_api=` always wins. Empty by default, which makes `iotgw_api=` mandatory |

The overlay tarball is root-owned with group/other write stripped (`go-w`), so
extracting it into the image can never loosen `/etc` or `/usr` permissions.

### CI and published artifacts

[`.github/workflows/live-image.yml`](../.github/workflows/live-image.yml) runs
on pull requests, on pushes to `main` that touch `live-image/`, on every `v*`
tag, and on demand. It:

1. runs `just check` and `just dist`;
2. on pushes, signs **SLSA build provenance** for every binary and tarball
   (verify with `gh attestation verify <file> -R <owner>/<repo>`);
3. uploads a **workflow artifact** `iotgw-live-<version>` containing
   `iotgw-linux-{amd64,arm64}`, `iotgw-live-overlay-linux-{amd64,arm64}.tar.gz`,
   `iotgw-openwrt-linux-{amd64,arm64}.tar.gz`, `remove.list` and
   `SHA256SUMS`;
4. on `v*` tags, **attaches the same files to the GitHub release** of that tag,
   creating the release if it does not exist.

### Deploying to a netboot server

The deploy recipes wrap [`scripts/live-image/rebuild.sh`](../scripts/live-image/README.md).
Over SSH, it removes the paths in `remove.list` from the image's unpacked
`squashfs-root/`, syncs the overlay in, repacks with the image's own
compression, and stages or installs the result. Nothing site-specific is
built in; pass the target per run:

| Variable | Meaning |
|---|---|
| `NETBOOT_HOST` | SSH destination of the netboot server (root), e.g. `root@netboot.example` |
| `LIVE_TREE` | directory under `ASSETS_DIR` that serves this live image |
| `ASSETS_DIR` | the netboot.xyz assets directory (default `/opt/stacks/netbootxyz/assets`) |

```bash
export NETBOOT_HOST=root@netboot.example LIVE_TREE=iotgw-live
just deploy-init <clonezilla-tree>   # one time: create LIVE_TREE from an existing Clonezilla live tree
just deploy-stage                    # repack into <LIVE_TREE>-candidate/ (not served) to boot-test first
just deploy-swap                     # install into LIVE_TREE (previous kept as filesystem.squashfs.bak)
```

Then add an iPXE menu entry that boots `<LIVE_TREE>/` and asks for the device
credentials, and pass the API URL on the kernel command line:

```ipxe
:iotgw-live
echo Device username (e.g. gw-01@1a2b3c4d):
read device_id
echo One-time code:
read otp
set url ${live_endpoint}/iotgw-live/
kernel ${url}vmlinuz boot=live username=user union=overlay config components noswap net.ifnames=0 fetch=${url}filesystem.squashfs initrd=initrd.magic device_id=${device_id} otp=${otp} iotgw_api=https://api.example
initrd ${url}initrd
boot
```

**Rollback:** on the netboot server, move
`<LIVE_TREE>/filesystem.squashfs.bak` back over `filesystem.squashfs`.

**Fast iteration without rebuilding the image:** on a live-booted gateway,
copy `dist/<arch>/iotgw-*` to `/usr/local/bin/` and run
`iotgw-bootstrap -otp <code>`. The copies are lost on reboot.

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

From the controller side the gateway is reached **through the Netmaker hub as
an SSH bastion** (a cert-only `iotgw-jump` account, decision-030). The client
can verify the live host certificate strictly:
`@cert-authority` + `HostKeyAlias=live-<name>-<id8>.<net>.<domain>.iotgw`.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Identity FAILED | booted a menu entry without the username/code prompt, or mistyped `name@net8` |
| VPN config fetch FAILED, HTTP 401 | the code expired, was already used, or the code was reset in the UI → `sudo iotgw-bootstrap -otp <new code>` |
| HTTP 429 "too many failed codes" | 5 wrong codes: the device's code endpoints are locked for 15 min |
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
