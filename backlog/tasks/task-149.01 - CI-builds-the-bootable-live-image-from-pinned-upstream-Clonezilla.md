---
id: TASK-149.01
title: CI builds the bootable live image from pinned upstream Clonezilla
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 14:18'
updated_date: '2026-09-29 17:59'
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
- [x] #1 Inventory of y0 tree vs upstream differences, each resolved (overlay / scripted step / dropped)
- [x] #2 Tagged release publishes vmlinuz, initrd, filesystem.squashfs + SHA256SUMS + provenance
- [x] #3 Artifact is immutable and referenced by digest
- [x] #4 Image boots under QEMU in CI (decision-029) and reaches iotgw-bootstrap
- [x] #5 CI gate fails the build if the image (squashfs + initrd) contains any SSH private key, ssh_host_* key or authorized_keys; the gate is green on the release
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**No SSH keys in the image (user requirement, 2026-09-29):**
- The published `filesystem.squashfs` (and initrd) must contain **no SSH key material**: no private keys (`id_*`, `*.pem`/`*.key` with `PRIVATE KEY`), no `ssh_host_*_key` (host keys are generated at boot by `iotgw-bootstrap`, decision-031), no `authorized_keys` / `authorized_keys2`, no `known_hosts` entries other than the `@cert-authority` line written at runtime.
- Upstream Clonezilla may ship or generate keys: strip them in the build (`remove.list` / scripted step), and remove `ssh_host_*` so sshd regenerates them.
- Enforced by a CI gate that unsquashes the built image and fails the job on any match (path patterns + content grep for `BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY` + gitleaks over the tree).

**Inventory y0 `iotgw-live` vs upstream Clonezilla 3.1.2-9 (2026-09-29):**
- Kernel identical. **initrd**: y0 added a static curl 8.4.0 + CA bundle and patched live-boot `9990-mount-http.sh` (wget → curl, `.part2` chunks) — this is what makes `fetch=https://` work. → reproduced in build.sh (static curl 8.22.0 + cacert-2026-09-25, pinned).
- **Packages added**: wireguard-tools + wireguard-go (agent calls `wg`/`wg-quick`; kernel 6.6.11 has the wireguard module → only wireguard-tools, pinned 1.0.20210914-1 which needs libc ≥ 2.14), btop, byobu, python3-newt (convenience → dropped). Packages removed on y0 (dnsutils, telnet, lz4, ntpsec…) were side effects → not reproduced.
- **sshd**: enabled at boot + `PermitRootLogin yes` → reproduced as `systemctl enable ssh` + overlay `40-iotgw-root-login.conf` (`prohibit-password`, no passwords).
- **Forbidden, dropped**: `root/.ssh/authorized_keys` (2 keys), break-glass `50-iotgw-authorized-keys.conf`, root password in `/etc/shadow`, shell/editor histories.
- **Deferred**: `/etc/profile` `MAQUINA_ID` hostname (Clonezilla path, decision-037).
- Upstream itself ships no SSH keys (host keys generated at boot by live-config 1160-openssh-server).

**Build:** `live-image/image/` (pins.env, build.sh, check-no-keys.sh, test-boot.sh), `just image` / `just image-test`, builder pinned by digest. Local + CI (`image` job, run 36602053507) green: QEMU boot fetches the squashfs, `iotgw-bootstrap.service` finishes, `ssh.service` starts. Key gate clean on rootfs and initrd.

**Published (v0.6.0):** `ghcr.io/i40sys/iotgw-live-image@sha256:91408278f22b66e7c24defb25e05fbcac1c5f4a651dabeb3c7603e3640d8b00e` (release asset `live-image-oci.txt` + `live-image-SHA256SUMS`); `gh attestation verify oci://…` OK; anonymous pull 200 (public).
<!-- SECTION:NOTES:END -->
