---
id: TASK-131
title: 'Provisioning shrinks the gateway LAN to /26: network.j2 hard-codes the netmask'
status: To Do
assignee: []
created_date: '2026-09-25 06:44'
labels:
  - kestra
  - ansible
  - provisioning
  - bug
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Found on gw-c3 (2026-09-25, Kestra exec 3Y2EmW9i3tFNGyBirESW3Y):** after the minimal provisioning run, the LAN bridge changed from /24 to /26 (10.254.253.1).

**Cause:** iotgw-kestra `templates/network.j2` line 25 hard-codes `option netmask '255.255.255.192'` for `lan`, whatever the site uses. Hosts outside the /26 lose the gateway (DHCP pool, static leases, PLCs/HMIs). The bridge ports (eth1–eth5) and WAN on eth0 are also hard-coded (task-130 notes).

**Fix direction:**
- Add a provisioning variable for the LAN netmask/prefix (e.g. `local_netmask` or CIDR on `local_ip_address`) to the deployment-config schema (x-step provisioning, x-group system) and the playbook preflight.
- Default to the gateway's CURRENT netmask read back from `/etc/config/network` (the same read-back pattern wg0 already uses), never a constant.
- Check `templates/dhcp.j2` start/limit and the DHCP static leases still fall inside the mask.
- Restore gw-c3 to /24 once fixed (backup in /root/.iotgw-provisioning-backup).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 network.j2 no longer hard-codes the LAN netmask; it comes from the config or the gateway's current value
- [ ] #2 The schema and preflight know the new variable; an invalid netmask/prefix is rejected before the gateway is touched
- [ ] #3 A provisioning run keeps an existing /24 LAN at /24 (verified on gw-c3, which is restored to /24)
<!-- AC:END -->
