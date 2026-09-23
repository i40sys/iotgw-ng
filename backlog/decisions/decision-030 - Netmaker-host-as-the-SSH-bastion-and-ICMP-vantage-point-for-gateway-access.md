---
id: decision-030
title: "030: Netmaker host as the SSH bastion and ICMP vantage point for gateway access"
date: '2026-09-23 05:42'
status: accepted
---
## Context

Every iotgw-ng **network** is its own Netmaker network (created by the
`netmaker-call` edge function, `doc-016`), and every **device** is a Netmaker
*extclient* in it. A booted gateway brings up `wg0` with its `/32` from that
network (e.g. `gw-c3` = `10.5.0.1` in `c3` = `10.5.0.0/31`) and peers **only**
with the Netmaker server host (`racknerd-6f14949`, `216.45.62.117:443`), which is
the network's ingress gateway and holds the other address of the range
(`10.5.0.0`).

The controller, meaning the Kestra runner pods in the kind cluster, is a member of
**none** of these networks and has no L3 route into them. Verified 2026-09-23:
from the controller host, `10.5.0.1` leaves by the default route and is lost.
From the Netmaker host, it is reachable (`ip r get 10.5.0.1` → `dev netmaker`,
ICMP 3/3, TCP/22 open).

That broke two things:

- **"Check online"** pinged the device from the controller, which can never
  answer. The backend was also still parsing Kestra tasks (`icmp_ping`,
  `check_ansible_access`) that the `connectivity-check` flow no longer has, so
  it could not report success even when the device was fine.
- **Provisioning** already hopped through a bastion (`Flow.yaml` ProxyCommand to
  `kv('VPN_JUMP_HOST')`, `task-092`/`task-093`). But the KV was never set, and
  the bastion trusted no User CA, so the runner's `iotgw-ops` certificate could
  not authenticate to it.

Alternatives considered:

| Option | Why not |
|---|---|
| Join the controller to every Netmaker network (netclient on the kind host) | One membership per network, created on every network create; the controller becomes a peer of every customer network. |
| Route the Netmaker ranges into the cluster (server forwards between a controller network and each gateway network) | Cluster-wide routes into every customer network, plus forwarding/NAT on the VPN hub, for traffic that is only ever SSH + ICMP. |
| **Use the Netmaker host as the vantage point and SSH bastion** | The host already is on every network by construction; nothing to add per network. **Chosen.** |

## Decision

### 1. The Netmaker host is the single access point into gateway networks

```
Kestra runner pod (kind)                      Netmaker host (racknerd-6f14949)           gateway (wg0 10.5.0.1)
────────────────────────                      ────────────────────────────────           ──────────────────────
mint short-lived iotgw-ops cert  ──ssh──►  iotgw-jump@216.45.62.117
  (backend /internal/ssh/ops-cert,           forced command: ping <IPv4>  ──ICMP──────►  (reachability)
   zone = the device's domain)
                                  ──ssh -W gw:22──► (forward, port 22 only) ──SSH──────►  sshd: TrustedUserCAKeys
                                                                                            (same iotgw-ops cert)
```

- **ICMP reachability** is measured **from the Netmaker host**, over its
  `netmaker` interface: `ssh iotgw-jump@<bastion> 'ping <gateway-ip>'`. This is
  the meaningful "is the VPN up" signal, because that host is the device's only
  WireGuard peer.
- **SSH/Ansible** reaches the gateway with
  `ProxyCommand ssh -W %h:%p iotgw-jump@<bastion>`, for both `connectivity-check`
  and `provisioning`.
- The bastion address lives in the Kestra KV **`VPN_JUMP_HOST`**
  (`216.45.62.117`) in namespace `iotgw-ng`, never in the public flow repo.

### 2. A dedicated, narrow jump account: `iotgw-jump` (not root)

Installed and refreshed by **`scripts/ssh-ca/bastion-trust.sh`** (idempotent,
`sshd -t` before reload, automatic rollback):

- **Authentication:** only an SSH **user certificate** signed by an iotgw-ng
  zone **User CA** with principal **`iotgw-ops`**. The certificate is the runner's
  short-lived ops cert, the same one the gateway accepts. The account has no
  password (locked) and `AuthorizedKeysFile none`.
- **Trust anchor:** `/etc/ssh/iotgw/user-cas.pub` holds every linked zone's User
  CA, fetched from the public pki route `/ssh/cas/<id>/ca.pub`. Principals come
  from `/etc/ssh/iotgw/principals/%u`, and only `iotgw-jump` has that file.
- **What a session may do:** `ForceCommand /usr/local/sbin/iotgw-jump-cmd`
  allows exactly `ping <IPv4>` (`ping -n -c 3 -W 2`). There is no shell,
  `PermitTTY no`, and no agent, X11 or stream-local forwarding.
- **Forwarding:** `AllowTcpForwarding local` with `PermitOpen *:22`, which is
  enough for `ssh -W <gateway>:22` and nothing else.
- **Root is untouched.** Root's key-based access is unchanged. Certificate logins
  for root are refused because root has no principals file.

Verified 2026-09-23 with a real `iotgw-comforsa` ops cert:

| Check | Result |
|---|---|
| `ping 10.5.0.1` from the bastion | 3/3 replies |
| `-W 10.5.0.1:22` | returned the gateway's SSH banner |
| `-W :80` | refused |
| Shell | refused |
| Root with the cert | refused |
| Root with its existing key | still works |

### 3. Connectivity check = ICMP from the Netmaker host + SSH/Ansible through it

- **`connectivity-check` flow** (`i40sys/iotgw-kestra`): after minting the ops
  cert, the pod runs the bastion ping and logs an **`ICMP_RESULT rc=<n>`**
  marker. It then runs the Ansible `ping` module (an SSH + Python round-trip)
  through the ProxyCommand hop. A failed ping does not skip the SSH check, and
  the pod's exit code is Ansible's.
- **Backend** (`checkDeviceConnectivity`): polls the execution for up to 3 min,
  because the pod clones the repo, installs tools and mints the cert before it
  connects, which takes about 1m45s. It reads the SSH/Ansible result from the
  `run_connectivity_check` task and the ICMP result, including RTT, from the
  execution logs. Online means ICMP ok and SSH/Ansible ok.
- **UI:** shows both steps. "Network reachability" is ICMP from the Netmaker
  host; "Device access" is SSH/Ansible through the bastion.

### 4. Host-key posture is unchanged

The bastion hop stays TOFU (`task-093` AC#3: the Netmaker host is not an
iotgw-ng gateway and holds no certificate from our Host CA). The gateway hop
verifies the host certificate once the device is enrolled (`task-093`).

## Consequences

### Positive

- Nothing to configure per network: any network Netmaker creates is reachable
  immediately, because the Netmaker host is always its ingress gateway.
- The controller never joins or routes into customer networks. The only exposed
  surface is one certificate-only account that can ping and forward to port 22.
- The same short-lived `iotgw-ops` certificate authenticates both hops. There
  is no long-lived bastion key to rotate or leak.

### Negative / operator obligations

- **New domain ⇒ re-run `scripts/ssh-ca/bastion-trust.sh`.** The bastion trusts
  the User CAs that existed when it last ran. A domain created later cannot
  reach the bastion until it is re-run. The same applies to the **live image**,
  which must trust the new zone's User CA before the SSH step can log in to a
  live-booted gateway (`scripts/live-image/render-trust.sh` + `rebuild.sh`,
  `task-095`). Both refreshes are manual today and should become part of domain
  creation.
- The Netmaker host is now on the access path. If it is down, no gateway is
  reachable, but that is already true of the VPN itself.
- The ICMP result travels as a log marker, so the flow's `ICMP_RESULT` line and
  the backend parser must change together.

## Related

- `decision-024` (SSH-CA target architecture), `task-092` (runner uses the
  iotgw-ops user cert), `task-093` (host-cert verification; bastion TOFU),
  `task-095` (live image User CA trust), `doc-016` (network/device provisioning
  via `netmaker-call`).
