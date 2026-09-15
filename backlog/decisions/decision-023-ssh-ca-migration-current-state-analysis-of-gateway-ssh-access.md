---
id: decision-023
title: "023: SSH CA migration — current-state analysis of gateway SSH access"
date: '2026-09-14 07:30'
status: accepted
---
## Context

This ADR is the **verified baseline** for the SSH CA migration
(`decision-024`…`decision-028`). It records *what exists today*, file by file,
so the change map and the migration plan are traceable to observed facts rather
than to assumptions. Everything below was verified on 2026-09-14 against the
live systems (`y0` = `10.2.0.3`, the kind cluster, `pki.joor.net`) or against
the working trees listed in *Sources*.

> **Status `accepted`** because it is a factual record, not a choice. The
> choices live in `decision-024`+.

## Sources inspected

| Repo / host | Path | Role |
|---|---|---|
| `y0` (`10.2.0.3`) | `/opt/stacks/netbootxyz/assets/clonezilla-debian-3.1.2-9-80072992/squashfs-root/` | the **live image** (Clonezilla) the gateway PXE-boots into |
| `y0` | `/opt/stacks/netbootxyz/{compose.yml,assets/config/menu.ipxe}` | how the live image is served |
| `owrt_iot_gw` | `playbooks/` | the Ansible source of truth for OS install + provisioning |
| `iotgw-ng` | `kestra/data/main/iotgw-ng/_files/` | the Kestra namespace blob (a superset copy of `owrt_iot_gw`) |
| `iotgw-ng` | `supabase/volumes/functions/{vpn,menu.ipxe,about.ipxe}/` | edge functions on the boot/provisioning path |
| `iotgw-ng` | `iotgw-ui/apps/backend/src/{services/kms.ts,routers/{devices,deployments}.ts}` | SSH-key minting + Kestra hand-off |
| `iotgw-ng` | `iotgw-ui/supabase/migrations/` | `devices.ssh_key_id`, `deployment_jobs.ssh_key_id` |
| `miimetiq3/pki-manager` | whole repo + live `pki.joor.net` | the PKI we will consume |
| `ssh-cert-test` | whole repo | validated end-to-end PoC of the target model |

## The three SSH trust layers that exist today

SSH access to an `iotgw-ng` gateway is not one mechanism but **three**, each
with its own key material and its own failure mode.

### Layer 1 — the live image (PXE / Clonezilla)

The gateway first appears on the network as a **live-booted Clonezilla
machine**, before OpenWRT exists on its disk. Ansible reaches *that* machine.

```
squashfs-root/root/.ssh/
  authorized_keys      3 hardcoded public keys (see table)
  id_ed25519           static private key, comment "clonezilla"   ← baked into the image
  id_ed25519.pub
squashfs-root/etc/ssh/
  sshd_config          Include /etc/ssh/sshd_config.d/*.conf ; PermitRootLogin yes
  sshd_config.d/       EMPTY
  (no ssh_host_* keys) → regenerated on every live boot
```

| # | Fingerprint | Type | Comment | Also appears as |
|---|---|---|---|---|
| 1 | `SHA256:kxhsZf7ig6wML+bEtES6Wxtr5hLpV5Hen2D2Mm4xQfg` | RSA-2048 | `oriol@mini6` | Kestra namespace file `keys/id_rsa(.pub)`; `https://u.joor.net/ssh-pub-key` |
| 2 | `SHA256:pi/rPhDgXZdAa33Zk6x2cyeLa6Rm/hwc8LvTNYOOGKU` | RSA-3072 | `root@iot-gw` | `files/credentials/id_rsa(.pub)`; `github.com/sabatligats.keys` entry #1 |
| 3 | `SHA256:VMJ3HrTXUAmqTcnUPmJS4sTusMTcOLT8t424geeKfwg` | RSA-2048 | *(unattributed)* | — |

Consequences that matter for the migration:

- **No host keys ship in the image**, so every live boot presents a *new* host
  identity. Every inventory therefore carries
  `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`. There is no
  server authentication at all during the install phase.
- The image contains a **private key** (`id_ed25519`) that is identical on every
  boot of every machine.
- There is **no image build pipeline**. `filesystem.squashfs` (Dec 2024) is
  served read-only by a `darkhttpd` container; `squashfs-root/` is an unpacked
  copy on disk that must be re-packed **by hand** with `mksquashfs`. Any live
  image change is a manual, out-of-band operation on `y0`.
- The served iPXE menu is `assets/config/menu.ipxe` on `y0`
  (`site_name netboot.joor.net`). The Supabase `menu.ipxe` / `about.ipxe` edge
  functions are **stale duplicates** pointing at `10.2.0.47:8000` and are not on
  the live boot path.

### Layer 2 — the installed OpenWRT gateway

Two independent mechanisms put key material on the finished gateway.

**(a) `files/enable_ansible.sh`** — runs inside the live environment, chrooted
into the freshly-copied OpenWRT rootfs (`d01_install_owrt.yml`):

```sh
opkg install openssh-server openssh-keygen openssh-sftp-server python3
mkdir -p /root/.ssh/
wget -O /root/.ssh/authorized_keys https://github.com/sabatligats.keys
wget -O - https://u.joor.net/ssh-pub-key 2>/dev/null >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
sed -i 's/^#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config
/etc/init.d/sshd enable
```

So the gateway's `authorized_keys` is **6 individual public keys fetched over
the public internet at install time** (5 from a GitHub user's `.keys`, 1 from a
URL shortener redirecting to a GitHub gist). It also removes dropbear and
enables `PermitRootLogin yes` with password auth left at its OpenWRT default.

**(b) `tasks/system.yaml`** — runs over SSH against the installed gateway
(`i11_provisioning_iotgw.yaml` / `i11_install_iotgw.yaml`):

```yaml
- name: "system: setting SSH pub key"      # credentials/id_rsa.pub -> /root/.ssh/id_rsa.pub
- name: "system: setting SSH private key"  # credentials/id_rsa     -> /root/.ssh/id_rsa  (0600)
```

This installs **both halves of one shared RSA-3072 key pair on every gateway in
the fleet** — the same `root@iot-gw` key that is trusted by the live image and
published as `sabatligats.keys` entry #1. Twelve other task files
(`dockge`, `nodered`, `telegraf`, `firewall`, …) then consume
`/root/.ssh/id_rsa` as `key_file:` for `community.docker` operations, so that
shared key is load-bearing, not vestigial.

> **The two copies have already diverged.** In `owrt_iot_gw` these two tasks are
> unconditional. In the public Kestra flow source
> (`github.com/i40sys/iotgw-kestra`, the copy that actually runs) they carry
> `when: deploy_shared_ssh_key | default(false) | bool` — added during the
> `task-069` sanitisation — so the shared key is **not** deployed by default on
> the Kestra path. The exposure is therefore narrower than the `owrt_iot_gw`
> source suggests, but the key material still ships in both repos and is still
> trusted by the live image, so R1 stands. The divergence itself is a finding:
> the two playbook trees are not kept in step.

`tasks/system.yaml` is also the only place that touches `sshd_config` on a
gateway (one `lineinfile` swapping `sftp-server` for `internal-sftp`), and it
does so **without `validate:`**, then unconditionally
`/etc/init.d/sshd reload && /etc/init.d/sshd restart`.

### Layer 3 — the Kestra runner's client credentials

`install`, `provisioning` and `connectivity-check` all build an inventory with
`ansible_ssh_private_key_file: "keys/id_rsa"` and then `chmod 600 keys/id_rsa`.

- The committed namespace file `keys/id_rsa` **is** key #1 (`oriol@mini6`) — a
  personal key, statically distributed, matching the live image's
  `authorized_keys`.
- `task-069` added an in-pod Cosmian-KMS fetch that **overwrites** `keys/id_rsa`
  with the per-device key (`device_ssh_<deviceId>`, KMIP `Get`, PKCS#8 →
  OpenSSH) whenever `SSH_KEY_ID` is non-empty.
- **Nothing ever installs that per-device public key into a gateway's
  `authorized_keys`.** `decision-010`'s "3. Deploy to device" step was specified
  but never implemented. Grepping the whole namespace blob for
  `authorized_key`/`ssh_key_id` finds only `enable_ansible.sh` and comments.

So the KMS path can only authenticate against a gateway that already trusts that
key — which no code path arranges. In practice the flows work because
`keys/id_rsa` falls back to the personal key when `SSH_KEY_ID` is empty, and
that key *is* in both `authorized_keys` sets.

## Complete lifecycle trace

| # | Question | Answer |
|---|---|---|
| 1 | **Where do the keys originate?** | Hand-generated long ago. Key #1 is a personal workstation key; key #2 was generated as `root@iot-gw`; key #3 is unattributed. The *device* keys (`device_ssh_<id>`, Ed25519) originate in Cosmian KMS, minted by `apps/backend/src/services/kms.ts` on device INSERT. |
| 2 | **Where are they stored?** | #1: live-image squashfs + Kestra namespace file `keys/id_rsa` + a public gist. #2: `owrt_iot_gw/playbooks/files/credentials/id_rsa` + Kestra `files/credentials/id_rsa` + `github.com/sabatligats.keys` (public) + every gateway's `/root/.ssh/`. #3: live image only. Device keys: Cosmian KMS; `devices.ssh_key_id` holds only the KMIP id. |
| 3 | **How do they pass through Edge Functions / APIs?** | They do **not**. No edge function handles SSH keys. `vpn/index.ts` only does TOTP-authenticated WireGuard config delivery. `netmaker-call` only handles WireGuard/Netmaker. The only SSH-adjacent API traffic is `deployments.executeKestraDeployment` packing `ssh_key_id` (an opaque KMIP id) into the Kestra `json_data`. |
| 4 | **How do Ansible / provisioning scripts receive them?** | Three ways: (a) as Kestra **namespace files** staged into the runner pod (`keys/id_rsa`, `files/credentials/id_rsa`); (b) by **HTTP download at install time** inside `enable_ansible.sh`; (c) by **KMIP fetch in the runner pod** (`fetch_kms_key.py`, task-069) driven by the `SSH_KEY_ID` env. |
| 5 | **How are they installed on a gateway?** | `enable_ansible.sh` writes `/root/.ssh/authorized_keys` (chroot, pre-first-boot). `tasks/system.yaml` copies the shared keypair to `/root/.ssh/id_rsa{,.pub}`. Nothing installs a per-device key. |
| 6 | **What else depends on individual keys being deployed?** | Ansible reachability for all three flows; `i00_chage_inventory_ip.yaml`'s "REACHABLE BUT SSH REFUSED — add the AnsibleForms public key" check; 12 `tasks/*.yaml` that use `/root/.ssh/id_rsa` as a docker `key_file`; `templates/autossh.j2` (`ssh -i /etc/dropbear/id_rsa … -R 2222:localhost:22`, a reverse-tunnel backdoor referencing a dropbear key path that `enable_ansible.sh` deletes the daemon for); `tasks/nodered.yaml` (`.sshkeys/admin_id_rsa`); every inventory's `StrictHostKeyChecking=no`. |

## Data model

| Object | SSH-related fields | Notes |
|---|---|---|
| `domains` | `id`, `name`, `display_name` | **no** PKI/CA linkage today |
| `networks` | `domain_id`, `ipv4_cidr`, `ipv6_cidr` | — |
| `devices` | `ssh_key_id` (KMIP id, nullable), `private_key`/`public_key` (**WireGuard**, not SSH), `totp_counter` | `ssh_key_id` is the only SSH field; no host key, no cert, no fingerprint |
| `deployment_jobs` | `ssh_key_id` | denormalised snapshot |

No table stores an SSH public key, a host certificate, a CA reference or a
principal. **No API payload anywhere carries SSH key material** — only the
opaque KMIP id.

## Assumptions that must change

1. **"Trust is a list of keys."** Both `authorized_keys` sets are static
   enumerations. → must become "trust is a CA" (`TrustedUserCAKeys`).
2. **"Gateways have no verifiable identity."** `StrictHostKeyChecking=no`
   everywhere; no host keys in the image. → must become host certificates
   signed by a per-domain Host CA, verified via `@cert-authority`.
3. **"One private key may be shared fleet-wide."** `credentials/id_rsa` is on
   every gateway and is public. → gateway private keys must be unique and
   generated on-device.
4. **"Access is granted by editing a file in a repo / a GitHub profile."**
   Revoking an operator today means editing `sabatligats.keys` and re-running
   install on every gateway. → must become cert expiry + KRL.
5. **"Provisioning is the only channel to a gateway."** Trust material changes
   today require a full Ansible run. → the enrollment/renewal channel must be
   independent of, and cheaper than, a provisioning run.
6. **"`ssh_key_id` designates a login credential."** It designates a key that is
   *fetched* by the runner but *never authorised* on the target. → the per-device
   KMS key's role must be resolved explicitly (`decision-028` §7).
7. **"The live image is immutable infrastructure."** It is a hand-unpacked
   directory on one VM. → any trust material we put there is manual and
   un-versioned unless we build a pipeline.
8. **"sshd config edits are safe."** `tasks/system.yaml` edits `sshd_config`
   with no `validate:` and then `restart`s. → must become validated
   (`sshd -t`) + `reload`.

## Risks visible in the current state (independent of the migration)

| # | Finding | Severity |
|---|---|---|
| R1 | A single RSA-3072 **private** key is installed on every gateway, and its public half is published on a GitHub profile. Compromise of one gateway is compromise of the fleet. | high |
| R2 | Gateway `authorized_keys` is fetched over plain `wget` from `github.com` and a URL shortener at install time — an unauthenticated third-party trust root. | high |
| R3 | No host authentication anywhere on the provisioning path (`StrictHostKeyChecking=no`); the install phase is MITM-able. | high |
| R4 | A static private key ships inside the live image. | medium |
| R5 | Revocation is impossible without re-running install on every gateway. | medium |
| R6 | `sshd_config` is edited without validation and `restart`ed — a malformed edit strands the gateway. | medium |
| R7 | `authorized_keys` entry #3 is unattributed — nobody can say whose access that is. | medium |

These are **inputs** to the migration, not blockers: the target model removes
R1–R5 and R7 by construction, and R6 is fixed in the same `tasks/system.yaml`
change (`decision-025`).

## Sequence as it stands today

```
PXE (netboot.joor.net, darkhttpd on y0)
  └─ menu.ipxe → clonezilla squashfs (3 hardcoded authorized_keys, no host keys)
       │
       │  Kestra `install` flow, runner pod, keys/id_rsa = oriol@mini6 (or KMS key)
       │  ansible -o StrictHostKeyChecking=no  ── NO host authentication
       ▼
  d01_install_owrt.yml → partitions → copy OpenWRT → chroot
       └─ enable_ansible.sh: wget github.com/sabatligats.keys + u.joor.net → authorized_keys
       └─ setup_vpn.sh: writes wg0 into /etc/config/network
       ▼
  reboot into OpenWRT
       │
       │  Kestra `provisioning` flow (same client key, same no-host-auth)
       ▼
  i11_provisioning_iotgw.yaml → tasks/system.yaml
       └─ copies SHARED credentials/id_rsa{,.pub} to /root/.ssh/
       └─ lineinfile sshd_config (no validate) → reload + restart
       └─ 12 further tasks use /root/.ssh/id_rsa as a docker key_file
```

## Decision

Adopt this document as the agreed baseline. `decision-024` defines the target,
`decision-025` maps every item above to a change and an owner, `decision-026`
defines the new sequence, `decision-027` the migration, `decision-028` the
choices that remain open.

## References

- `decision-010` — SSH key management with Cosmian KMS (the `ssh_key_id` model)
- `decision-009` — TOTP authentication for device VPN access (the auth primitive
  reused for enrollment in `decision-026`)
- `task-069` — in-pod KMS fetch of `keys/id_rsa`
- `pki-manager` `docs/ssh/concept.md`, `docs/ssh-api-contract.md`
- `ssh-cert-test` — validated PoC of the target model
</content>
</invoke>
