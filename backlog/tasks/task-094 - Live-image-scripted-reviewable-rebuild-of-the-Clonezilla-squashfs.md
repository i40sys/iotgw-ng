---
id: TASK-094
title: 'Live image: scripted, reviewable rebuild of the Clonezilla squashfs'
status: In Progress
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-15 06:50'
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
- [ ] #3 A machine is booted from the candidate image and its sshd confirmed running BEFORE the swap is considered done
- [x] #4 Re-running the script with no source change produces no functional difference to the served image
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**2026-09-15 — tooling built + validated on y0 (lab).**

- **AC#1 (established as fact):** y0 (10.2.0.3) darkhttpd serves /opt/stacks/netbootxyz/assets ro; a machine boots <path>/filesystem.squashfs. BOTH served trees match their squashfs-root/ byte-for-byte (rsync -c = 0 content diffs; SSH files hash-equal): clonezilla-debian-3.1.2-9-80072992 (install path: clonezilla-debian/backup/restore/clonezilla-boot) and clonezilla-debian-3.1.2-9-2025-11-06 (vpn item). So editing squashfs-root/ + repack DOES change what boots; the mtime gap was a red herring. .bak = rollback copies; .new = orphan (no squashfs-root, not in menu) — not authoritative. Documented in scripts/live-image/README.md.
- **AC#2:** scripts/live-image/rebuild.sh — one command repacks squashfs-root/ (matching xz/1MiB), and --swap installs it keeping filesystem.squashfs.bak as rollback. Rebuild validated on y0; swap path executes for real on the first content change (task-095).
- **AC#4:** demonstrated — a rebuild with no source change is CONTENT-IDENTICAL to the served image; --swap is skipped in that case (idempotent).
- **AC#3 OPEN:** boot a machine from the candidate + confirm sshd BEFORE swap. --stage publishes a boot-testable <tree>-candidate/ and prints the menu entry; the actual PXE boot is the operator step (needs a machine). y0 left clean (no residual candidates).
<!-- SECTION:NOTES:END -->
