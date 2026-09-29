---
id: TASK-149.05
title: Cut over sites to the OVH netboot and retire y0 iotgw-live
status: To Do
assignee: []
created_date: '2026-09-29 14:18'
updated_date: '2026-09-29 15:06'
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
- [ ] #3 y0 iotgw-live retired or chained to OVH; docs updated
<!-- AC:END -->
