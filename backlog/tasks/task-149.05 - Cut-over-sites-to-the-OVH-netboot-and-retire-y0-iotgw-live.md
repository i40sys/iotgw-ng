---
id: TASK-149.05
title: Cut over sites to the OVH netboot and retire y0 iotgw-live
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 14:18'
updated_date: '2026-09-29 18:25'
labels:
  - netboot
  - migration
dependencies:
  - TASK-149.01
  - TASK-149.02
  - TASK-149.03
parent_task_id: TASK-149
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What.** Roll the chainloader out (office UDM PXE boot file / local TFTP, customer USB sticks), run one real provisioning end-to-end from OVH, then retire y0's `iotgw-live` tree/menu entry (or make it chain to OVH). Update infra-kb `sources/services/netboot.md` and `scripts/live-image/README.md` (y0 no longer authoritative).

**Safety:** never run install/provisioning against the banned ranges (192.168.4.0/24, 10.121.0.0/16); use the documented test gateway.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Office PXE path uses the chainloader and lands on the OVH menu
- [ ] #2 One gateway provisioned end-to-end from OVH
- [x] #3 y0 iotgw-live retired or chained to OVH; docs updated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Office cutover (2026-09-29):**
- The UDM (`ymbihq` LAN) hands iPXE clients `http://netboot.joor.net/config/menu.ipxe` (no TFTP on the UDM). Unchanged.
- y0 `config/menu.ipxe` is now a **stub** that chains the CI-built chainloader served from y0 (release v0.6.0, SHA256-verified): `ipxe.efi` on UEFI, `undionly.kpxe` on BIOS → HTTPS to the OVH menu. Backup `menu.ipxe.bak-20260929-pre-chainloader`; old tree `iotgw-live.retired-20260929` (404 now).
- **Simulated in QEMU**: BIOS iPXE client with the UDM boot file URL → stub → chainloader → `https://netboot.iotgw.i40sys.com/menu.ipxe ... ok` → OVH menu.
- Docs: `scripts/live-image/README.md` (superseded banner), infra-kb `netboot.md` (with rollback).
- Pending: the same on real hardware + one gateway provisioned end-to-end from OVH (needs an operator at the console to type the device code).
<!-- SECTION:NOTES:END -->
