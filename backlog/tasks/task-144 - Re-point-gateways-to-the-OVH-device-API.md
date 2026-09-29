---
id: TASK-144
title: Re-point gateways to the OVH device API
status: To Do
assignee: []
created_date: '2026-09-29 10:37'
labels:
  - ovh
  - gateway
  - migration
dependencies:
  - TASK-142
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Why.** After the kind → OVH migration (task-142) the device API lives at `https://device.iotgw.i40sys.com` (same device-API CA, so no re-trust). Gateways still have the kind `api_base` (`https://10.2.0.47`), so VPN / SSH-CA refresh and renewal will stop working.

**How (per gateway, operator console — never via install/provisioning flows):**
`uci set iotgw.main.api_base='https://device.iotgw.i40sys.com' && uci commit iotgw`, then `iotgw vpn refresh` / `iotgw ssh refresh`.

**Also:** the install flow and live image default (`API_BASE`, `identity.api_base`) and the iotgw-kestra `templates/firewall.j2` entry `10.2.0.47/32` still assume kind.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Inventory of enrolled gateways and their current api_base
- [ ] #2 gw-c3 re-pointed; VPN and SSH-CA refresh succeed against device.iotgw.i40sys.com
- [ ] #3 Install flow / live image defaults and firewall.j2 updated for OVH
<!-- AC:END -->
