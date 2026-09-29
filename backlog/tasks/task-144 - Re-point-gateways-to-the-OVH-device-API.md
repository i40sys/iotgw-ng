---
id: TASK-144
title: Re-point gateways to the OVH device API
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 10:37'
updated_date: '2026-09-29 15:23'
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
- [x] #1 Inventory of enrolled gateways and their current api_base
- [x] #2 gw-c3 re-pointed; VPN and SSH-CA refresh succeed against device.iotgw.i40sys.com
- [x] #3 Interim: y0 menu.ipxe iotgw_api switched to https://device.iotgw.i40sys.com (y0 stays until TASK-149.05; the OVH menu itself is TASK-149.02)
- [x] #4 iotgw-kestra reviewed: the install copies api_base from the live image identity (now OVH via the menu) — no default to change; firewall.j2 10.2.0.47/32 is the operator workstation allowed to the gateway web UIs, not the kind API — kept
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Gateways re-pointed to OVH (2026-09-29).**

**Inventory (OVH DB, 12 device rows):**
- **gw-c3** (comforsa, `wg0` 10.5.0.1, office LAN 10.2.0.210) — the only real gateway running the agent (`iotgw v0.4.0`). The `iot-gateway-datacenter` row shares its old LAN IP (10.2.0.210).
- **iotgw-m1** (sabat, 10.5.0.121) — offline: no ICMP from the Netmaker host.
- The rest (office / production / warehouse rows) are seed data with no agent.

**gw-c3:**
- Backup `/root/iotgw.config.bak-pre-ovh-20260929`; `api_base` http://10.2.0.47:8000 -> `https://device.iotgw.i40sys.com`, `api_ca=/etc/iotgw/api-ca.pem` (same sha256 as the repo CA).
- `iotgw ssh refresh -force`: renewed via OVH (TLS, pinned CA), `sshd -t` OK, reloaded.
- `iotgw vpn refresh -otp <code>` (code from OVH `getDeviceCode`): config unchanged, tunnel UP, Internet OK.
- Access used: short-lived `iotgw-ops` certs minted by the OVH backend (`/internal/ssh/ops-cert`, port-forward) through the `iotgw-jump` bastion — this also proves OVH's pki-manager path. Throwaway key deleted.

**y0 netboot (interim until TASK-149.05):** `menu.ipxe` `iotgw_api=https://device.iotgw.i40sys.com` (backup `menu.ipxe.bak-20260929-pre-ovh`).
<!-- SECTION:NOTES:END -->
