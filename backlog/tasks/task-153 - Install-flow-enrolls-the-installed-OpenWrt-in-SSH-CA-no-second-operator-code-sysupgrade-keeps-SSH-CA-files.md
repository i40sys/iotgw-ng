---
id: TASK-153
title: >-
  Install flow enrolls the installed OpenWrt in SSH-CA (no second operator code)
  + sysupgrade keeps SSH-CA files
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 06:54'
updated_date: '2026-10-06 11:25'
labels:
  - ssh-ca
  - openwrt
  - kestra
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Why.** After an OpenWrt install the gateway boots with no SSH-CA trust: provisioning cannot SSH in with the iotgw-ops certificate (UNREACHABLE), and the server still holds the pre-reinstall enrollment (409), so the operator must press Reset SSH enrollment in the UI and type a second one-time code at the console ([s]). Seen on gw-c3, 2026-10-05/06.

**What.** Enroll the installed OS during the install, from the live image, through the SAME agent path as provisioning (tasks/ssh_ca.yaml) and the console: `chroot /mnt/p2 /usr/sbin/iotgw ssh refresh -otp <code> -offline` (same files, same 50-/60- drop-ins, same Include, sshd -t + rollback; -offline only skips reload/serving check). The code comes from the backend's /internal/devices/enroll-code with `reinstall: true` (clears the stale enrollment, audited). Also add the SSH-CA files to the existing sysupgrade keep list (tasks/iotgw_agent.yaml): OpenWrt keep.d/openssh-server keeps sshd_config.d/ but not the ecdsa key, host cert, User/Host CA, auth_principals, revoked_keys, known_hosts — a missing RevokedKeys file makes sshd reject every key login.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Agent: `iotgw ssh refresh -offline` writes the same files/drop-ins as the online path, validates with sshd -t, rolls back on failure, never reloads; unit-tested
- [x] #2 Backend: POST /internal/devices/enroll-code accepts reinstall:true — clears ssh_host_pubkey, writes an audit entry, returns the code; tested
- [x] #3 iotgw-kestra install: tasks/ssh_ca_install.yaml enrolls the installed rootfs; the install fails with a clear message if enrollment fails; agent pin bumped
- [x] #4 sysupgrade keeps the SSH-CA files (same keep list as the agent)
- [x] #5 QEMU/OpenWrt verification: installed rootfs boots serving the host certificate and trusting the User CA; sshd config accepted by OpenWrt's openssh-server
- [x] #6 Real gateway (office LAN, never the banned ranges): PXE code typed once, install → reboot → SSH PKI HEALTHY, provisioning connects with no extra code
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
**Plan (one SSH-CA path for install, provisioning and console):**
1. Agent: `iotgw ssh refresh -offline` — same installEnrollment (files, 50-/60- drop-ins, Include, sshd -t, rollback); no reload/serving check.
2. Backend: enroll-code `reinstall: true` → clear ssh_host_pubkey (as Reset SSH enrollment) + audit, only once a code is available.
3. iotgw-kestra: `tasks/ssh_ca_install.yaml` (chroot /mnt/p2, backend code via root-only file, live resolv.conf for the call, sshd -T assertion), imported by d01 after the agent install; SSH-CA files added to the existing sysupgrade keep list.
4. QEMU OpenWrt e2e case 7b: offline enroll leaves the running sshd alone, sshd -t/-T OK, `sysupgrade -l` keeps every SSH-CA file, after a power cycle sshd serves the cert to a strict client.
5. Release (agent + backend image), pin the agent in iotgw-kestra, roll the backend to OVH, sync Kestra, then the real-gateway test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Implemented and released as v0.6.3; real-gateway test pending (AC#6).**

**What changed:**
- `live-image/internal/agent` + `cli` — `iotgw ssh refresh -offline`: the same installEnrollment (files, 50-/60- drop-ins, Include, sshd -t, rollback) without reload/restart (monorepo bab6ff9).
- `iotgw-ui/apps/backend` — enroll-code `reinstall: true` clears ssh_host_pubkey + audit entry, only once a code is available; test added (57/57 green, typecheck OK).
- `iotgw-kestra` 5f3327d — `tasks/ssh_ca_install.yaml` (chroot /mnt/p2, backend code in a root-only file, live resolv.conf for the call, sshd -T assertion) imported by d01 after the agent install; SSH-CA files added to the sysupgrade keep list in tasks/iotgw_agent.yaml; agent pinned v0.6.3 (sha256 5373186a…).
- QEMU OpenWrt e2e case 7b (73/73): offline enroll leaves the running sshd untouched; sshd -t/-T accept it; `sysupgrade -l` keeps every SSH-CA file; after a power cycle sshd serves the certificate to a strict client.

**Rollout:**
- Tag v0.6.3 (CI green, cosign-verified backend sha256:fa55a5d0…); OVH backend rolled out via tf.sh platform apply; release manifest v0.6.3 generated + verified; Kestra namespace files synced.

**Pending:** AC#6 on gw-c3 (PXE code once → install → reboot → SSH PKI HEALTHY → provisioning with no extra code).

**Hardware test passed (gw-c3, 2026-10-06):**
- Codes used: `vpn` + `ssh-live-enroll` at 07:37 (the single operator code, PXE), `ssh-enroll` at 07:47 (backend code, install flow) — no console code.
- Install 3lTLhtoaMJIzBzeyhO0z8l: "SSH enrollment installed offline … valid until 2027-01-04; sshd -t OK"; sshd -T assertion passed; failed=0.
- Provisioning 64sDmLuODis9oVTH1zV6VL: connected with the iotgw-ops certificate, took the renew path (no code); failed=0.
- `iotgw ssh status` on the gateway: User CA / Host CA / Host identity / sshd all HEALTHY; /etc/sysupgrade.conf carries the SSH-CA entries.
<!-- SECTION:NOTES:END -->
