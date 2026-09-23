# live-image — iotgw live provisioning environment

The PXE live image (iPXE entry **`VPN test`**) turned from a Clonezilla menu
with scripts on top into an IoT-gateway provisioning console. Architecture and
rationale: [`decision-031`](../backlog/decisions/).

```text
boot → iotgw-bootstrap (root, systemd oneshot)
         identity → network → [VPN]  vpn API → wg0 → handshake
                            → [PKI]  ssh-ca live-enroll → User CA → live host cert → sshd
         state → /run/iotgw/bootstrap.json   logs → journalctl -u iotgw-bootstrap
tty1 → iotgw-status (Bubble Tea dashboard)  [q] → normal shell   `iotgw-status` → reopen
```

## Layout

| Path | What |
|---|---|
| `cmd/iotgw-bootstrap` | boot-time provisioning (VPN and SSH PKI as two independent API calls) |
| `cmd/iotgw-status` | read-only operator dashboard (Go + Bubble Tea / Lip Gloss / Bubbles) |
| `internal/state` | the `/run/iotgw/bootstrap.json` contract between the two |
| `internal/envelope` | device-code envelope, byte-compatible with `openssl enc -aes-256-cbc -pbkdf2 -iter 300000` |
| `internal/bootstrap` | the boot steps |
| `internal/collect` | read-only probes (host, network, Internet, VPN, VPN-server reachability, SSH PKI) |
| `internal/tui` | Bubble Tea model + Lip Gloss views |
| `overlay/` | rootfs additions (systemd unit, Clonezilla boot hook `S98iotgw-console`) |
| `remove.list` | legacy paths the image drops (`vpn-setup`, `/opt/scripts`, `rc.local`, static trust) |

## Build and deploy

```bash
live-image/build.sh            # vet + test + static CGO_ENABLED=0 binaries + overlay tarball (dist/)
live-image/deploy.sh           # on y0: remove legacy paths, sync overlay, repack → <tree>-candidate/ (not served)
# boot ONE machine from the candidate (menu.ipxe entry pointing at the -candidate path), check the dashboard
live-image/deploy.sh --swap    # install as the served image (previous kept as filesystem.squashfs.bak)
```

`deploy.sh` wraps [`scripts/live-image/rebuild.sh`](../scripts/live-image/README.md)
(`--remove`, `--sync-from`, `--stage` / `--swap`). Like every `--sync-from`, it
mutates the tree's `squashfs-root/` in place.

## On the live machine

| Need | Do |
|---|---|
| Dashboard | shown on tty1 after boot; `iotgw-status` to reopen |
| Exit to a shell | `q` |
| Details of a failure | `d` in the dashboard; full log: `journalctl -u iotgw-bootstrap` |
| Retry with a fresh code (boot code expired) | `sudo iotgw-bootstrap --otp <code from the UI>` |
| Versions | `iotgw-status --version`, `cat /etc/iotgw-live-release` |
