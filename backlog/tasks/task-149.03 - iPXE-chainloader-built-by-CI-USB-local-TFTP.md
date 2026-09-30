---
id: TASK-149.03
title: iPXE chainloader built by CI (USB + local TFTP)
status: Done
assignee: []
created_date: '2026-09-29 14:18'
updated_date: '2026-09-30 05:09'
labels:
  - ci
  - netboot
  - ipxe
dependencies: []
parent_task_id: TASK-149
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What.** An in-repo, CI-built iPXE chainloader that takes any machine (UEFI or legacy BIOS) to the OVH netboot menu over HTTPS, independent of the site's DHCP boot options.

**Project subfolder: `netboot/chainloader/`** (sibling of `live-image/`), owning everything needed to build and test it:
- `chain.ipxe` — the embedded script: `dhcp` (with retries), `chain https://netboot.iotgw.i40sys.com/menu.ipxe`, and a clear on-screen fallback (retry / iPXE shell / exit to firmware) when OVH is unreachable.
- `IPXE_VERSION` — pinned upstream iPXE commit/tag (+ checksum of the source tarball).
- `config/` — iPXE build options (`DOWNLOAD_PROTO_HTTPS`, `IMAGE_TRUST_CMD` off, console), trust anchors (`TRUST=` pinned ISRG Root X1/X2 PEMs).
- `justfile` — `build`, `test`, `dist` recipes (same pattern as `live-image/justfile`); `README.md` with how to flash the USB image and wire local TFTP.
- `test/` — the QEMU test harness below.

**Outputs:** `ipxe.efi` (UEFI, x86_64), `undionly.kpxe` (legacy BIOS, chain from a site TFTP), `ipxe-usb.img` (hybrid USB image for UEFI+BIOS), `SHA256SUMS`.

**CI/CD:** a `netboot-chainloader` workflow (path filter `netboot/chainloader/**`), builds from pinned iPXE source, runs the tests, attests provenance, and on `v*` tags attaches the outputs to the GitHub release (and the artifact store chosen in the parent task). No credentials in the image or the workflow.

**Tests (`netboot/chainloader/test/`, run in CI via QEMU + OVMF, no network access to OVH):**
1. **Static:** the embedded script in the built binary equals `chain.ipxe` (extract from the build tree); the binary contains no secrets (gitleaks over outputs); expected build options are set.
2. **UEFI chain (happy path):** QEMU + OVMF boots `ipxe.efi`; QEMU user-mode net (slirp DHCP) + a local HTTPS test server (certificate from a **test CA** baked only into the test build via `TRUST=`) serving a stub `menu.ipxe` that `echo`s a marker and powers off; assert the marker on the serial console.
3. **Legacy PXE chain:** QEMU (SeaBIOS) PXE-boots `undionly.kpxe` via slirp TFTP (`-netdev user,tftp=…,bootfile=undionly.kpxe`); same marker assertion.
4. **USB image:** boot `ipxe-usb.img` as a USB disk under OVMF and under SeaBIOS; same marker assertion.
5. **TLS trust negative:** HTTPS server with a certificate from an **untrusted** CA → chain must fail (no fallback to plain HTTP) and show the fallback message.
6. **Unreachable server:** no HTTP server → timeout, fallback menu shown, no hang (bounded test time).
7. **Hostname:** a test build variable overrides the menu URL for tests only; the release build must embed exactly `https://netboot.iotgw.i40sys.com/menu.ipxe` (asserted).
8. **Reproducibility:** two builds from the same pinned source produce identical SHA256 (or the difference is documented).

**Watch:** Secure Boot (unsigned iPXE) — document the firmware setting or plan a shim; keep the release trust anchors to the public roots only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 netboot/chainloader/ subfolder with pinned iPXE source, embedded chain.ipxe, build config, justfile and README
- [x] #2 CI workflow builds ipxe.efi, undionly.kpxe and ipxe-usb.img from source, runs the test suite and publishes them with SHA256SUMS + provenance on v* tags
- [x] #3 QEMU tests pass in CI: UEFI chain, legacy PXE/TFTP chain, USB image (UEFI + BIOS)
- [x] #4 Negative tests pass: untrusted TLS certificate refused, unreachable server shows the fallback, no plain-HTTP downgrade
- [x] #5 Static tests pass: embedded script matches chain.ipxe, release URL asserted, no secrets in outputs
- [x] #6 Real UEFI machine runs the chainloader from the site's local boot path into the OVH menu (office: y0 stub over HTTP — the UDM has no TFTP); USB image verified under QEMU UEFI + BIOS only
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Implemented (2026-09-29):** `netboot/chainloader/` — iPXE v2.0.0 (commit 12798ec2 verified), `chain.ipxe`, `config/local/` (HTTPS for BIOS too, which v2.0.0 disables by default), ISRG X1/X2/YR/YE with `TRUST=` **and** `CERT=` (without CERT the chain cannot be completed: servers do not send the root → EACCES), `build.sh` in a digest-pinned container, `test/run.sh`, `netboot-chainloader.yml`.

**Local suite 13/13:** static (embedded script, exact release URL, HTTPS only, anchors by SHA-256 fingerprint in the binary, gitleaks), UEFI PXE, BIOS PXE, USB on UEFI + BIOS, untrusted TLS (refused, no fetch), unreachable (fallback), reproducibility (fixed EMBED file name — iPXE records it).

**Gotchas:** OVMF mirrors the console to serial twice (“IIPPXXEE”); test markers match both forms.

**Hardware (2026-09-30):** gw-c3 ran the v0.6.0 `ipxe.efi` via the office path (UDM → y0 stub) and reached the OVH menu; live provisioning completed. There is no TFTP at the site, and the USB image was not flashed on hardware (covered by the CI QEMU USB tests on UEFI and BIOS).
<!-- SECTION:NOTES:END -->
