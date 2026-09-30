---
id: TASK-149
title: 'Netboot iPXE server on the OVH k8s stack, serving CI-built live images'
status: Done
assignee: []
created_date: '2026-09-29 14:18'
updated_date: '2026-09-30 05:09'
labels:
  - ovh
  - netboot
  - live-image
  - ci
dependencies:
  - TASK-142
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Goal.** Move the PXE/iPXE boot service from y0 (`netboot.joor.net`, darkhttpd on the office LAN) to the OVH MKS stack (task-142), and serve **only live images built by CI/CD** — never the hand-maintained trees on y0.

**Current state (2026-09-29):**
- y0 `/opt/stacks/netbootxyz/assets` served read-only by darkhttpd (`10.2.10.20`); UDM DHCP boot file = `http://netboot.joor.net/config/menu.ipxe`.
- Menu: `iotgw-live` (device_id + OTP, `iotgw_api=http://10.2.0.47:8000` — still kind), `vpn`, `local`, Clonezilla `backup` / `restore` / `clonezilla-debian` (preload `boot.tgz` + `<maquina_id>.tgz`, run `/etc/rc.local`), `shell`, `netinfo`, `about`.
- CI (`.github/workflows/live-image.yml`) publishes only the `iotgw` binaries and the **overlay** tarball; the bootable `vmlinuz` / `initrd` / `filesystem.squashfs` (~386 MB) is repacked **on y0** by `scripts/live-image/rebuild.sh` from a hand-prepared Clonezilla 3.1.2-9 tree.

**Decisions (user, 2026-09-29):**
- Base = **upstream Clonezilla live, pinned** (URL + SHA256) — reproducible in CI; no y0 tree.
- Menu entries: iotgw-live, boot from local disk, Clonezilla backup/restore, tools (shell, netinfo).
- Clients reach OVH through a **local iPXE chainloader** (USB / local TFTP) with an embedded script that chains to OVH over HTTPS — not by pointing site DHCP at OVH.
- Artifact format: **open** — default is an OCI artifact on ghcr.io/i40sys pinned by digest (keeps decision-021's three images); alternatives: a 4th custom image, or GitHub release assets + SHA256SUMS.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All subtasks Done; a gateway is provisioned end-to-end from the OVH netboot (iPXE chainloader -> menu -> iotgw-live -> VPN + SSH PKI against device.iotgw.i40sys.com)
- [x] #2 y0's iotgw-live entry retired or redirected; infra-kb netboot.md updated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**2026-09-29 user updates:** no SSH keys anywhere in the served images (gate in 149.01 / 149.02); Clonezilla resources (boot.tgz, per-machine tgz, mounts) deferred — menu wiring commented, entries fail on purpose (149.04, low).

**Done 2026-09-30:** CI-built live image (v0.6.0 OCI digest) served by the OVH netboot; CI chainloader; y0 reduced to a stub; gw-c3 provisioned end to end from OVH on real hardware. Clonezilla resources remain decision-037.
<!-- SECTION:NOTES:END -->
