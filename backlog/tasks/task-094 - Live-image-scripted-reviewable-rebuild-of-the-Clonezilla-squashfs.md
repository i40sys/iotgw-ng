---
id: TASK-094
title: 'Live image: scripted, reviewable rebuild of the Clonezilla squashfs'
status: Done
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-15 14:36'
labels:
  - ssh-ca
  - live-image
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
There is no live-image build pipeline. On `y0` (10.2.0.3) the image is served read-only by a `darkhttpd` container from `/opt/stacks/netbootxyz/assets/`, and `clonezilla-debian-3.1.2-9-80072992/squashfs-root/` is an **unpacked directory that has to be repacked by hand** with `mksquashfs`.

**Nobody can currently say the served image matches that tree.** `filesystem.squashfs` is dated Dec 2024; `squashfs-root/` was last touched Jan 2024. Establishing whether they agree is the first thing this task should do, because every later live-image change assumes editing `squashfs-root/` affects what boots.

**Also on disk:** `filesystem.squashfs.bak` (same size, same date) and a second tree `clonezilla-debian-3.1.2-9-2025-11-06/`, plus a `.new` directory. Which of these is authoritative is not documented.

**What to build:** `scripts/live-image/` in iotgw-ng that renders the trust material, syncs it into `squashfs-root/`, repacks, and swaps atomically while retaining the previous image as a rollback.

**Verification is the hard part** — "it repacked" is not "it boots". A rebuilt image that fails to boot, or whose sshd fails to start, strands the PXE path for every gateway install. Netbooting a real machine from the candidate image before swapping is the only honest check; decide whether that is feasible or whether a staged path (serve the candidate under a second `path` in `menu.ipxe` and boot one machine from it) is needed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Whether the served filesystem.squashfs matches squashfs-root/ is established as a fact, and the authoritative tree among the several on disk is documented
- [x] #2 One command rebuilds and installs the live image, retaining the previous image as a rollback
- [x] #3 A machine is booted from the candidate image and its sshd confirmed running BEFORE the swap is considered done
- [x] #4 Re-running the script with no source change produces no functional difference to the served image
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**AC#3 done 2026-09-15:** a machine (10.2.0.210) was PXE-booted from the staged candidate and sshd confirmed healthy (sshd -t OK; live logins accepted). The primary tree was then --swap-installed (previous image kept as filesystem.squashfs.bak). Full 094 rebuild pipeline validated end-to-end on y0.
<!-- SECTION:NOTES:END -->
