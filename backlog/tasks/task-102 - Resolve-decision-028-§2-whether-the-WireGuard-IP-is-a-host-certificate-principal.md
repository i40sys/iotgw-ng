---
id: TASK-102
title: >-
  Resolve decision-028 §2: whether the WireGuard IP is a host-certificate
  principal
status: Done
assignee: []
created_date: '2026-09-14 07:08'
updated_date: '2026-09-17 10:26'
labels:
  - ssh-ca
  - decision
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-028-ssh-ca-open-security-and-architecture-decisions.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-028 §2 leaves this UNRESOLVED and no task covered it. The `ssh-ca` edge function currently **does** include the device's IP as a principal, so the recommendation is already in the code — it needs ratifying or reversing.

**For:** operators dial gateways by IP today (`ssh root@10.121.x.y`), and without the IP as a principal every such connection falls back to a host-key prompt, which is exactly the behaviour this migration removes.

**Against:** WireGuard IPs are reassignable. If a device is deleted and its IP recycled to another device, the old certificate — unexpired and, if nobody offboarded it, unrevoked — still validates for the new occupant's address. That is a real impersonation path, not a theoretical one.

**What decides it:** whether Netmaker actually recycles extclient IPs, and how quickly. If it does, the mitigation is to make offboard-on-delete mandatory and monitored, so a recycled IP is always preceded by a revocation — which makes this depend on the backend offboard task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Netmaker's IP reuse behaviour for deleted extclients is established by observation, not assumption
- [x] #2 decision-028 §2 records whether the IP stays a principal and its status flips to DECIDED
- [x] #3 If the IP stays, offboard-on-delete is mandatory and there is a check that catches a device deleted without one
- [x] #4 The ssh-ca edge function matches the decision
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Decision 2026-09-15 (decision-028 §2):** the WireGuard IP STAYS a host-cert principal; mitigated by mandatory, monitored offboard-on-delete (§10). §2 sub-point → DECIDED. Open: AC#1 observe Netmaker IP-reuse for deleted extclients; AC#3 a check that catches a device deleted without offboard; AC#4 ssh-ca edge fn matches.

**AC#4 done 2026-09-16** — the `ssh-ca` edge function already matches the decision (IP STAYS a principal): `supabase/volumes/functions/ssh-ca/index.ts` builds `addresses` from the label-based FQDNs and appends `device.ip_address` (lines 313-314), passes them to `signHost` and exposes them as `host_principals` (l.318/327). No code change needed to ratify §2.

**Remaining (both gated on external/other work):**
- **AC#1** — observe Netmaker's actual IP-reuse for DELETED extclients (does it recycle, how fast) against `api.netmaker.i40sys.com`. External Netmaker interaction; not yet done.
- **AC#3** — the mitigation (mandatory, monitored offboard-on-delete + a check that catches a device deleted without one) is exactly **task-081's delete-side** (`offboardHost` is already stubbed in `services/pki.ts`). So AC#3 lands with task-081, i.e. 102 and 081 close together.

**AC#1 done 2026-09-17 — Netmaker IP reuse OBSERVED (not assumed).** Ran a live experiment via the Netmaker REST API (master key) on network bd60f60f (10.2.0.0/24, ingress gateway, 0 extclients): created 3 extclients → 10.2.0.254/.253/.252; **deleted the .253 one**; the next create got **10.2.0.253 back** — Netmaker recycles a freed extclient IP immediately. Cleaned up (0 extclients left). This CONFIRMS the §2 threat: a deleted device's host cert (IP is a principal) would validate for the next occupant of that IP → mandatory offboard-on-delete is genuinely required.

**AC#3 done 2026-09-17 — mandatory offboard-on-delete + orphan check, both proven (commit 903a090).**
- **Offboard-on-delete:** `deleteDevice` now calls `offboardHost(ssh_host_id)` (terminal; best-effort with a loud error on failure so the orphan check catches a miss; the delete is not reverted since the row is gone). Proven: attached a stale orphan host to a throwaway device, ran `deleteDevice` → backend logged *"Offboarded device's pki-manager host (certs revoked, terminal)"* and the host flipped to `offboarded` on pki.joor.net.
- **The check (`checkSshHostOrphans`):** lists ACTIVE `.iotgw` hosts (scoped by the FQDN suffix so other pki tenants like *.ymbihq.local / *.acme.example are never flagged) with no `devices.ssh_host_id` referencing them = a device deleted without offboard. Proven: it flagged exactly the 2 real stale orphans (`canary.warehouse.iotgw`, `live-canary-20260914.warehouse.iotgw` — old enrollments) and NOT the live warehouse host (which has a device). Remediated both (offboarded) → orphan list now empty; the current `iot-gateway-warehouse-ca4d0b74…` host stays `active`.

All 4 ACs met — task Done. (AC#2 decided; AC#4 the edge fn already keeps the IP as a principal.)
<!-- SECTION:NOTES:END -->
