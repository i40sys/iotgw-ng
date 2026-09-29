# iotgw netboot chainloader (task-149.03)

A pinned, CI-built [iPXE](https://ipxe.org) that takes any machine — UEFI or
legacy BIOS — to the OVH netboot menu **over HTTPS**, independent of the site's
DHCP boot options:

```
firmware (PXE / USB) → this iPXE → DHCP → https://netboot.iotgw.i40sys.com/menu.ipxe
```

| File | Use |
|---|---|
| `chain.ipxe` | the embedded script: DHCP, chain the menu (HTTPS only), after 3 failed attempts a fallback menu (retry / iPXE shell / exit to firmware) |
| `IPXE_VERSION` | upstream tag + exact commit; the build refuses any other commit |
| `config/local/` | build options: HTTPS on every platform (v2.0.0 turns it off for BIOS), `poweroff`/`sleep`, serial console |
| `certs/` | the only trust anchors: ISRG Root X1, X2, YR, YE (public Let's Encrypt roots), embedded with `TRUST=` + `CERT=` |
| `build.sh` / `justfile` | build in a digest-pinned Debian container |
| `test/run.sh` | the test suite |

## Outputs

- `ipxe.efi` — UEFI (x86_64). Put it on a site TFTP server as the UEFI boot file.
- `undionly.kpxe` — legacy BIOS PXE (chains through the NIC's UNDI). Site TFTP boot file for BIOS clients.
- `ipxe-usb.img` — hybrid USB image (UEFI + BIOS): `dd if=ipxe-usb.img of=/dev/sdX bs=4M conv=fsync`.

Published on every `v*` release with `chainloader-SHA256SUMS` and signed build
provenance (`gh attestation verify <file> -R i40sys/iotgw-ng`).

## Build and test

```bash
cd netboot/chainloader
just build   # dist/release/{ipxe.efi,undionly.kpxe,ipxe-usb.img,SHA256SUMS}
just test    # static checks + QEMU suite (needs qemu-system-x86, ovmf, ipxe-qemu)
```

`test/run.sh` builds a **test variant** — the same `chain.ipxe` with the menu
URL pointed at a local HTTPS server (`https://10.0.2.2:18443/`, QEMU user
networking) and a throwaway test CA as its only trust anchor — and runs:

1. **Static** (release build): embedded script equals `chain.ipxe`; the binary embeds exactly `https://netboot.iotgw.i40sys.com/menu.ipxe`; no `http://` or test URL; the pinned ISRG roots are the embedded anchors; gitleaks finds nothing.
2. **UEFI PXE**: OVMF PXE-loads `ipxe.efi` over TFTP → HTTPS menu reached.
3. **BIOS PXE**: SeaBIOS + NIC ROM loads `undionly.kpxe` → HTTPS menu reached.
4. **USB**: `ipxe-usb.img` as a USB disk under OVMF and under SeaBIOS → HTTPS menu reached.
5. **Untrusted TLS**: server certificate from another CA → refused, fallback shown, menu never fetched (no plain-HTTP downgrade).
6. **Unreachable**: no server → bounded retries, fallback menu, no hang.
7. Release URL assertion (part of 1).
8. **Reproducibility**: a second release build has identical SHA256.

## Notes

- **Secure Boot**: this iPXE is not signed. Disable Secure Boot on machines that
  boot it (or plan a shim-signed build).
- The menu URL is the only site-specific value; there are no credentials in the
  chainloader. When the OVH menu is down, operators get the fallback menu
  instead of a silent hang.
