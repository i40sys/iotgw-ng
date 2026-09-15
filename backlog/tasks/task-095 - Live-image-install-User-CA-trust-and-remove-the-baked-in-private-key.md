---
id: TASK-095
title: 'Live image: install User CA trust and remove the baked-in private key'
status: In Progress
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-15 09:03'
labels:
  - ssh-ca
  - live-image
  - security
milestone: m-1
dependencies:
  - TASK-071
  - TASK-094
  - TASK-107
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the live image's key material with public trust material only.

**Current state (verified on `y0` = 10.2.0.3, path `/opt/stacks/netbootxyz/assets/clonezilla-debian-3.1.2-9-80072992/squashfs-root/`):**
- `root/.ssh/id_ed25519` — a **private** key identical on every boot of every machine. Delete it.
- `root/.ssh/authorized_keys` — three hardcoded keys: `SHA256:kxhsZf7ig6wML+bEtES6Wxtr5hLpV5Hen2D2Mm4xQfg` (`oriol@mini6`), `SHA256:pi/rPhDgXZdAa33Zk6x2cyeLa6Rm/hwc8LvTNYOOGKU` (`root@iot-gw`, also `sabatligats.keys` #1), and `SHA256:VMJ3HrTXUAmqTcnUPmJS4sTusMTcOLT8t424geeKfwg` which **nobody has attributed**.
- `etc/ssh/sshd_config` already has `Include /etc/ssh/sshd_config.d/*.conf` and the drop-in dir is empty, so no `Include` insertion is needed here (unlike OpenWRT).

**The target state was already validated at runtime** on a live-booted gateway (2026-09-14, 10.2.0.210): `ssh-user-ca.pub` + `auth_principals/root` + a `60-` CA drop-in + a `50-` break-glass drop-in were installed, `sshd -t` passed, `systemctl reload ssh` applied them, and then a certificate-only login succeeded (`ED25519-CERT ... ID oriol@iotgw-lab CA ECDSA SHA256:SoEpWf...`) while the three break-glass keys still worked and an uncertified key was refused. So this task is about baking that state into the image, not about discovering it.

**Two things to carry over from that run:**
- The `50-` drop-in restated `AuthorizedKeysFile .ssh/authorized_keys .ssh/authorized_keys2` verbatim rather than narrowing to one file, so break-glass behaviour is not changed by accident.
- Whether the image carries every zone's User CA or a dedicated installer zone's is decision-028 §5 (task-071) — do not guess it here.

Requires the rebuild tooling from the live-image rebuild task; the squashfs is repacked by hand today.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The live image contains no private key material
- [ ] #2 A machine booted from the rebuilt image accepts a user certificate for the agreed principal, evidenced by the sshd certificate-acceptance log line
- [ ] #3 The named break-glass keys still work on a machine booted from the rebuilt image
- [x] #4 Every remaining authorized_keys entry has a documented owner
- [ ] #5 No pre-existing sshd setting is weakened — sshd -T before and after differ only in the intended keys
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**2026-09-15 — rebuild tooling for the trust bake-in built + validated (no boot yet).**

- render-trust.sh renders the additions-only overlay from live pki.joor.net (iotgw-lab User CA SHA256:SoEpWf… — matches the §5 lab evidence): ssh-user-ca.pub (0444, every zones User CA), auth_principals/root (iotgw-admin/iotgw-ops), empty revoked_keys, 50-/60- sshd drop-ins.
- rebuild.sh --harden removes baked-in root/.ssh/id_ed25519{,.pub} (AC#1); --drop-key-fp removes the unattributed break-glass key (task-107), leaving the two attributed ones (AC#4).
- Validated end-to-end on a local fixture: candidate has NO private key, authorized_keys trimmed to 2, all 5 trust files present, and the content diff vs the served image is EXACTLY the 6 intended paths and nothing else (file-level evidence toward AC#5).

**OPEN (need a real PXE boot — operator step):** AC#2 (booted machine accepts an iotgw-admin user cert; sshd "Accepted certificate ID" log line), AC#3 (named break-glass keys still work on the booted machine), AC#5 (sshd -T before/after diff on the running image). Path: render → rebuild --sync-from --harden --drop-key-fp --stage on y0 → boot one machine from the -candidate path → confirm → --swap. Depends also on task-094 (tooling, done to 3/4) and the trust content re-rendering on rotation (task-103).
<!-- SECTION:NOTES:END -->
