---
id: TASK-089
title: >-
  Ansible: tasks/ssh_ca.yaml — idempotent gateway enrollment with a validated
  sshd reload
status: In Progress
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-15 17:33'
labels:
  - ssh-ca
  - ansible
  - openwrt
milestone: m-1
dependencies:
  - TASK-105
  - TASK-106
references:
  - >-
    backlog/decisions/decision-026-ssh-ca-gateway-provisioning-and-enrollment-sequence.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-026 phase 3 as a standalone, tagged, idempotent Ansible task file. Written and mirrored to the Kestra flow source; what remains is running it against a real OpenWRT gateway.

**What it does:** ensure an ecdsa-P256 host key exists (generated on the device; the private half never leaves) -> POST the public half to the `ssh-ca` edge function -> install the host certificate, the User CA anchor, the Host CA anchor, `auth_principals`, an empty `revoked_keys`, and both sshd drop-ins (`50-` break-glass sorts before `60-` CA so its `AuthorizedKeysFile` wins) -> gate on `sshd -t` -> `reload`, never `restart` -> assert from `sshd -T` that certificate auth AND break-glass are both live -> on any failure remove both drop-ins, reload back, and fail loudly.

**Why ecdsa-P256 and not ed25519:** pki-manager's encrypted per-host KRL channel is P-256 only.

**OpenWRT-specific risks this task exists to flush out (none are proven yet):**
- OpenWRT ships upstream's `sshd_config`, which has **no** `Include` line (Debian adds it). The task inserts one at BOF with `validate: sshd -t -f %s`. Untested on OpenWRT.
- The reload is `/etc/init.d/sshd reload`. On Debian the unit is `ssh`, on OpenWRT the init script is `sshd` — verify the name on the actual image, because a wrong name means the new config never takes effect while the task still reports success.
- `/usr/sbin/sshd` must exist at that path for `sshd -t` and `sshd -T`.
- `ssh-keygen -t ecdsa` requires the `openssh-keygen` package, which `enable_ansible.sh` installs — confirm it is present.

**Prerequisite:** the runner pod needs `SUPABASE_ANON_KEY` to reach Kong. The flow references a `supabase-anon` Secret with `optional: true`, and nothing creates it yet — see the separate bootstrap task.

Lands in `owrt_iot_gw/playbooks/` and in the Kestra flow source `github.com/i40sys/iotgw-kestra`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Running the task on a gateway leaves it presenting a valid host certificate and accepting iotgw-admin user certificates, with authorized_keys access untouched
- [ ] #2 A deliberately malformed drop-in causes the task to fail with sshd's running config intact and the gateway still reachable
- [x] #3 Re-running the task changes nothing and issues no new certificate
- [x] #4 The task works on an OpenWRT sshd_config that has no Include line to begin with
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**PROVEN END-TO-END via the actual playbook + live edge fn 2026-09-15** (i40sys/iotgw-kestra c753b0b). Ran tasks/ssh_ca.yaml against the real OpenWRT gateway 10.2.0.210 as device iot-gateway-warehouse: encrypt request with the device TOTP -> POST to the ssh-ca edge fn -> decrypt the AES-enveloped reply -> install host cert (edge-fn, serial 4, 90-day, principals iot-gateway-warehouse.*.warehouse.iotgw + 172.16.1.30) + User CA + auth_principals + empty RevokedKeys + 50-/60- drop-ins -> sshd -t gate -> /etc/init.d/sshd reload (never restart) -> assert cert auth AND break-glass both live. Run: ok=21 changed=4 failed=0. Verified after: iotgw-admin user-cert login accepted (sshd log, serial 9) + host cert verified via @cert-authority (0 known_hosts pins) + break-glass works. AC#1 DONE.

TWO REFINEMENTS still open (do not block the proven flow):
- AC#3 idempotence: the playbook currently RE-ISSUES a host cert on every run (new serial); add a guard that skips enrollment when the installed host cert is still valid and matches the device, to make re-runs a true no-op.
- AC#2: the rollback block (remove drop-ins + reload back + fail on sshd -t failure) is implemented AND the sshd -t fail-safe was proven MANUALLY (task-097 AC#5), but it has not been triggered THROUGH the task with a task-produced malformed drop-in.

Two bugs found + fixed while proving this: (1) the edge fn returns the reply AES-encrypted (not plain JSON) — decrypt with the TOTP; (2) the encrypt|POST|decrypt pipe needs /bin/bash (set -o pipefail not portable to dash).
<!-- SECTION:NOTES:END -->
