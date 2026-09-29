---
id: TASK-149.01
title: CI builds the bootable live image from pinned upstream Clonezilla
status: To Do
assignee: []
created_date: '2026-09-29 14:18'
updated_date: '2026-09-29 14:40'
labels:
  - ci
  - live-image
dependencies: []
parent_task_id: TASK-149
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What.** Extend `.github/workflows/live-image.yml` (or a new workflow) so every `v*` tag produces the full bootable set: download pinned upstream Clonezilla live (amd64, URL + SHA256 in-repo), `unsquashfs`, apply `iotgw-live-overlay-linux-amd64.tar.gz` + `remove.list`, `mksquashfs` (xz, 1 MiB like rebuild.sh), emit `vmlinuz`, `initrd`, `filesystem.squashfs`, `SHA256SUMS`, provenance attestation.

**Watch:**
- Diff the y0 trees against upstream first: anything the live image needs that was added by hand (packages, config) must move into the overlay or a scripted chroot step — never a baked private key (task-095).
- Artifact format decision (parent): default OCI artifact via `oras push ghcr.io/i40sys/iotgw-live-image:<ver>` pinned by digest.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Inventory of y0 tree vs upstream differences, each resolved (overlay / scripted step / dropped)
- [ ] #2 Tagged release publishes vmlinuz, initrd, filesystem.squashfs + SHA256SUMS + provenance
- [ ] #3 Artifact is immutable and referenced by digest
- [ ] #4 Image boots under QEMU in CI (decision-029) and reaches iotgw-bootstrap
- [ ] #5 CI gate fails the build if the image (squashfs + initrd) contains any SSH private key, ssh_host_* key or authorized_keys; the gate is green on the release
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**No SSH keys in the image (user requirement, 2026-09-29):**
- The published `filesystem.squashfs` (and initrd) must contain **no SSH key material**: no private keys (`id_*`, `*.pem`/`*.key` with `PRIVATE KEY`), no `ssh_host_*_key` (host keys are generated at boot by `iotgw-bootstrap`, decision-031), no `authorized_keys` / `authorized_keys2`, no `known_hosts` entries other than the `@cert-authority` line written at runtime.
- Upstream Clonezilla may ship or generate keys: strip them in the build (`remove.list` / scripted step), and remove `ssh_host_*` so sshd regenerates them.
- Enforced by a CI gate that unsquashes the built image and fails the job on any match (path patterns + content grep for `BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY` + gitleaks over the tree).
<!-- SECTION:NOTES:END -->
