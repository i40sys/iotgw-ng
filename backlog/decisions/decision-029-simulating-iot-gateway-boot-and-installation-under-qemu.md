---
id: decision-029
title: "029: Simulating IoT gateway boot and installation under QEMU"
date: '2026-09-14 08:00'
status: rejected
---

> **Rejected 2026-09-15 by the user.** Discarded: too much effort for a
> clone that is not realistic enough. QEMU cannot reproduce the real NIC /
> ZeroTier interface discovery, the eMMC, the PXE/DHCP VLAN, or the
> bastion+WireGuard path (see "What it explicitly cannot validate"), and the
> value it would add over the container + live-image tests already done did
> not justify the build. The OpenWRT-specific unknowns in task-089/task-097
> will be answered on real hardware instead. Kept for the record; do not
> revive without new justification.

## Context

The SSH CA milestone (`decision-024`…`-028`) is blocked on a resource we do not
have: **an installed OpenWRT gateway**. `task-097` (canary enrollment) and the
open ACs of `task-089` (`tasks/ssh_ca.yaml`) exist *only* to flush out OpenWRT
specifics — the init-script name, the missing `Include` line in OpenWRT's
`sshd_config`, the `sshd` binary path, whether `openssh-keygen` is installed.
None of that can be answered on a Debian container or on the live Clonezilla
image, both of which were already used and both of which are the wrong OS.

More generally, we have no way to exercise the install path at all without
dedicating real hardware and destroying its disk.

The constraint on any answer: **the squashfs image and the installation steps
must be identical between real hardware and the simulated environment.** A test
environment that needs its own fork of the playbooks tests the fork, not the
product.

## Decision

**Simulate the gateway with QEMU/KVM.** It is feasible, and the parity
constraint is satisfiable — with three deviations, none of which touch the
squashfs or any installation step.

### Why it works: the install path makes no hardware-specific assumptions

Read against `owrt_iot_gw/playbooks`:

| Step | What it actually requires | QEMU equivalent |
|---|---|---|
| `tasks/partitions.yaml`, `files/create_partitions.sh` | a block device; derives the partition prefix from the device name (`[0-9]$` → `p`) | any QEMU block device |
| partition 3 (`sgdisk --new=3:195312501:0`) | disk **> ~93.1 GiB**, else partition 3 cannot be created | sparse qcow2, 120 G virtual / a few GB real |
| `files/grub_install.sh` | `grub-bios-setup` on an `ef02` `bios_grub` partition with `legacy_boot` set | QEMU's **default SeaBIOS** |
| `files/copy_files.sh` | outbound HTTPS to `downloads.openwrt.org` | SLIRP NAT |
| `files/enable_ansible.sh` | outbound HTTPS to `github.com`, `u.joor.net`; `opkg` mirrors | SLIRP NAT |
| live image SSH | one of the three baked `authorized_keys` | our `~/.ssh/id_rsa` (`oriol@mini6`) is one of them |

Two findings worth recording on their own:

- **The install is legacy BIOS, not UEFI.** `menu.ipxe` sets
  `set platform efi`, but that is an iPXE build variable for choosing the ROM —
  the installed system is set up with `grub-bios-setup` against an `ef02`
  `bios_grub` partition. So QEMU needs **no OVMF**; its default SeaBIOS is the
  faithful choice. Using OVMF would have been the *less* accurate option.
- **The target disk is `/dev/nvme0n1`** (the `provisioning` flow's default;
  `install`'s default is `/dev/sda`). QEMU's `-device nvme` presents exactly
  `/dev/nvme0n1`, so `target_disk` needs no override.

### The three deviations

**1. Boot transport: `-kernel`/`-initrd`/`-append` instead of an iPXE chainload.**

iPXE's entire contribution on the install path is: fetch `vmlinuz`, fetch
`initrd`, set a kernel command line, `boot`. Passing the *same* three things to
QEMU is behaviourally identical from the kernel onward. Critically, the
`fetch=http://netboot.joor.net/.../filesystem.squashfs` parameter is preserved
verbatim, so **live-boot pulls the same 369 MB squashfs over HTTP from the same
server** — the image under test is the production image, byte for byte, not a
copy.

A higher-fidelity mode is available if we ever need to test the menu itself:
boot `ipxe.iso` in QEMU and chain `http://netboot.joor.net/config/menu.ipxe`.
That exercises iPXE and the menu too. It is strictly optional; the install path
does not depend on it.

**2. A serial console is added to the kernel command line.**

`console=ttyS0,115200n8`, so the VM is headless and scriptable. This is not an
invention: `menu.ipxe` already carries `#set cmdline console=ttyS0,115200n8`
commented out, and appends `${cmdline}` to the boot line. We are using a knob
the production menu already provides.

**3. How the Ansible controller reaches the VM.** See the open question below.

### What this unblocks

A QEMU gateway is a **real OpenWRT x86-64 install**, produced by the real
playbooks from the real image. So it can answer every OpenWRT question that
currently blocks the SSH CA milestone: the `/etc/init.d/sshd` name, inserting
`Include /etc/ssh/sshd_config.d/*.conf` into OpenWRT's upstream `sshd_config`,
`/usr/sbin/sshd` for `sshd -t`/`-T`, `ssh-keygen -t ecdsa` availability, and the
rollback path when `sshd -t` fails. It also lets `tasks/ssh_ca.yaml` be run
end-to-end destructively, repeatedly, at no risk.

### What it explicitly cannot validate

Stating this up front so nobody mistakes a green QEMU run for a green fleet:

- **Real NIC behaviour.** `net.ifnames=0`, driver quirks, and especially
  `tasks/system.yaml`'s ZeroTier interface discovery
  (`ip -o link show | awk '/zt/'`, retried 5×) depend on a real ZeroTier join.
- **The eMMC.** Real gateways expose `mmcblk0` (14.6 G) alongside the NVMe; a
  QEMU VM has only what we attach. Anything that keys off a second device is
  untested.
- **PXE/DHCP on the provisioning VLAN.** With `-kernel`/`-initrd` there is no
  DHCP-driven boot at all, and even in iPXE mode the DHCP server is SLIRP's.
- **The bastion and WireGuard path.** The `ProxyCommand` through
  `216.45.62.117`, the tunnel, and `setup_vpn.sh`'s effect on a real WAN.
- **Timing.** Disk and network are faster than real hardware; races that only
  appear on slow flash will not reproduce.
- **Hardware-specific firmware/TPM**, if any is ever relied on.

## Consequences

### Positive

- Unblocks the SSH CA critical path (`089` → `097` → `098` → `100`) without
  hardware, which is currently the milestone's scarcest resource.
- The install path becomes testable at all — today a change to
  `create_partitions.sh` or `grub_install.sh` can only be validated by wiping a
  real machine.
- Destructive and repeatable: `rm` the qcow2 and start over.
- Gives CI a plausible future target (`task-099`'s SSH-CA smoke could run
  against a QEMU gateway rather than a container that is not OpenWRT).

### Negative / costs

- Host requirements: KVM, ~a few GB per VM image, and a 120 G *virtual* disk.
- QEMU 6.2 (Ubuntu 22.04) is old; `-device nvme` works, but newer QEMU would be
  preferable if we hit device-model bugs.
- A green QEMU run is **weaker evidence** than a real canary. It must not be
  allowed to close `task-097` on its own — `task-097` is explicitly about real
  hardware. QEMU should become a *new* task, and `task-097` keeps its ACs.
- Each full run pulls 369 MB of squashfs plus the OpenWRT image; fine on LAN,
  worth caching.

### Environment (verified 2026-09-14 on this workstation)

| Requirement | Status |
|---|---|
| `/dev/kvm` | present; 24 CPUs with virtualisation extensions |
| `qemu-system-x86_64` | 6.2.0 |
| `-device nvme` | supported |
| free space on `/home` | 143 G |
| `http://netboot.joor.net/` | HTTP 200 in ~7 ms |
| `.../filesystem.squashfs` | HTTP 200, served by openresty |
| OVMF | present but **not needed** (legacy BIOS install) |

Note `http://10.2.0.3/` is not directly reachable — the assets are served
through `netboot.joor.net`, which is the name production uses anyway.

## Open question — how the Ansible controller reaches the VM

This is the one deviation with real design content, and it is **unresolved**.
The three flows build an inventory from `target_ip` and connect on port 22.

| Option | How | Cost |
|---|---|---|
| **A. QEMU in a container on the `kind` network** | run QEMU inside a container attached to Docker's `kind` network; the Kestra runner pod reaches it at a container IP on **port 22** | highest fidelity — inventory, port and orchestrator all unchanged; needs `/dev/kvm` passed into the container |
| **B. SLIRP `hostfwd` + non-standard port** | `hostfwd=tcp::2222-:22`, controller connects to the WSL host | requires `ansible_port` in the inventory — **a change to the install path**, so it breaks the stated constraint |
| **C. Run the playbooks from WSL directly** | same playbooks, same files, no Kestra | simplest; changes the *orchestrator* but not the installation steps. Good enough to answer the OpenWRT questions, not enough to validate the Kestra path |

**Recommendation: A**, falling back to **C** for a first pass. B should be
rejected precisely because it forces an inventory change.

Also unresolved: whether the VM gets a **second disk** to emulate the eMMC
(`mmcblk0`), and whether `enable_ansible.sh`'s dependency on reaching
`github.com` at install time is acceptable in a test harness or should be the
first thing the SSH CA migration removes (`task-091`).

## References

- `decision-023` — current-state baseline (the live-image and install layers)
- `decision-026` — provisioning sequence this would exercise
- `decision-027` — migration plan; QEMU supports phase 1-2 rehearsal
- `task-089`, `task-097` — the OpenWRT-specific work this unblocks
- `owrt_iot_gw/playbooks/{tasks/partitions.yaml,files/create_partitions.sh,files/grub_install.sh,files/copy_files.sh,files/enable_ansible.sh}`
- `y0:/opt/stacks/netbootxyz/assets/config/menu.ipxe` — the production boot line
</content>
