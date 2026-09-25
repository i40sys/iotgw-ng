---
id: TASK-135
title: Remove the legacy (unsealed) vpn reply and devices.totp_counter
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
updated_date: '2026-09-25 22:12'
labels:
  - security
  - cleanup
dependencies: []
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up of decision-033: once every live image in use sends reply_key, drop the code-encrypted reply fallback, then drop the unused totp_counter column.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.** vpn requires reply_key (426 otherwise; the legacy code-encrypted reply is gone); devices.totp_counter dropped (migration 20260926000000 + contract/types/seed/scripts).
- The live image on y0 (iotgw-live) was redeployed with the v0.4.0 overlay first (sends reply_key; CA added); previous image kept as filesystem.squashfs.bak.
- Not yet boot-tested on hardware: the next PXE live boot is the proof (rollback = restore the .bak).
<!-- SECTION:NOTES:END -->
