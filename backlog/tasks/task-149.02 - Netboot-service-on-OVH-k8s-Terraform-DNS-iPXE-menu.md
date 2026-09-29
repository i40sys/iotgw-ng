---
id: TASK-149.02
title: 'Netboot service on OVH (k8s, Terraform, DNS, iPXE menu)'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 14:18'
updated_date: '2026-09-29 18:15'
labels:
  - ovh
  - netboot
  - terraform
dependencies:
  - TASK-149.01
parent_task_id: TASK-149
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What.** An iotgw-owned netboot service in the `ymbihq` cluster:
- Namespace `netboot`; upstream static HTTP server (nginx) — no custom image; an initContainer pulls the pinned live-image artifact (by digest, verifies SHA256) into a volume (PVC or emptyDir; ~400 MB per version).
- `menu.ipxe` generated from a ConfigMap in-repo (`deploy/k8s/base/netboot/`), entries: iotgw-live (`iotgw_api=https://device.iotgw.i40sys.com`), local disk (UEFI `sanboot || exit` behaviour from infra-kb netboot.md), Clonezilla backup/restore/clonezilla-debian, shell, netinfo.
- Host `netboot.iotgw.i40sys.com`: Cloudflare record in `deploy/terraform/ovh/infra`, HTTPS listener + HTTPRoute on the `iotgw` Gateway, Let's Encrypt.
- Applied by `deploy/terraform/ovh/platform` (overlay `ovh`); kind gets the same component for dev.

**Watch:** Debian live-boot `fetch=` must work over **HTTPS** from the initrd; if it cannot, serve the squashfs over HTTP on a dedicated path and verify its hash on the client.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 netboot.iotgw.i40sys.com serves menu.ipxe and the pinned vmlinuz/initrd/squashfs with a valid certificate
- [x] #2 Artifact version/digest is pinned in the overlay and bumped by the release flow (deploy/RELEASE.md)
- [x] #3 Menu contains the agreed entries and iotgw-live passes the OVH device API
- [x] #4 live-boot fetch of the squashfs verified (HTTPS, or HTTP + hash check documented)
- [x] #5 Clonezilla backup/restore/clonezilla-debian entries present with the resource wiring (ocs_preload boot.tgz / <id>.tgz, rc.local run, repository mounts) commented out and pointing to DRAFT-001 (was TASK-149.04) — failing on purpose until then
- [x] #6 No SSH key material in anything the netboot serves (menu, preloads, image) — checked in CI
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Netboot live on OVH (2026-09-29).** `https://netboot.iotgw.i40sys.com` serves `menu.ipxe` + the v0.6.0 live image.

**What changed:** `deploy/k8s/base/netboot` (nginx + oras init container pulling `ghcr.io/i40sys/iotgw-live-image@sha256:91408278…` by digest and checking `SHA256SUMS`; menu ConfigMap), ovh overlay (netboot component, Gateway listener + HTTPRoute + LE SAN), infra DNS, live-image CI key gate over the netboot dir, `deploy/RELEASE.md` (pin the digest from `live-image-oci.txt`).

**Verified end to end (no local server):**
- (A) The **published v0.6.0 `ipxe-usb.img`** under OVMF/QEMU with internet: DHCP → `chain https://netboot.iotgw.i40sys.com/menu.ipxe ... ok` (real LE chain validated by the pinned ISRG anchors) → OVH menu rendered with every entry.
- (B) Kernel + initrd **downloaded from the netboot**, `fetch=https://netboot.iotgw.i40sys.com/iotgw-live/filesystem.squashfs`: the initrd's curl fetched over HTTPS, squashfs mounted, `iotgw-bootstrap.service` finished, `ssh.service` started.
- All files 200 with valid TLS; HTTP → HTTPS 301; menu `iotgw_api=https://device.iotgw.i40sys.com`; Clonezilla wiring commented (DRAFT-001).
<!-- SECTION:NOTES:END -->
