# Live-image (Clonezilla) rebuild tooling — `task-094`

Scripted, reviewable rebuild of the PXE live image, replacing the hand-run
`mksquashfs` on the netboot host. See `decision-023`/`decision-025` for the
layer this touches and `task-095` for the trust-material content that will be
synced in.

## Where the image lives (established as fact, `task-094` AC#1, 2026-09-15)

On the netboot host **`y0` (`10.2.0.3`)**, `darkhttpd` (container `netboot`,
`10.2.10.20`) serves `/opt/stacks/netbootxyz/assets` **read-only** as
`netboot.joor.net`. A PXE-booting machine fetches `<path>/filesystem.squashfs`;
`squashfs-root/` next to it is an unpacked copy for editing.

**Two trees are authoritative** — both referenced by the served
`config/menu.ipxe`:

| Tree | Served to | `filesystem.squashfs` vs `squashfs-root/` |
|---|---|---|
| `clonezilla-debian-3.1.2-9-80072992` | `clonezilla-debian` / `backup` / `restore` / `clonezilla-boot` (the **install** path, `maquina_id`) | **identical** (0 content diffs; SSH files hash-equal) |
| `clonezilla-debian-3.1.2-9-2025-11-06` | `vpn` item (`device_id`+OTP) | **identical** (0 content diffs; SSH files hash-equal) |

Verified by extracting each served `filesystem.squashfs` and `rsync -c`-diffing
it against its `squashfs-root/` (pseudo-fs excluded): **zero real content
differences**. The mtime gap (squashfs newer than `squashfs-root/`) was a red
herring. **Conclusion: editing `squashfs-root/` and repacking here does change
what boots.** Both trees carry the same baked-in `root/.ssh/id_ed25519` — the
private key `task-095` removes.

**Not authoritative:** `*.bak` are rollback copies; `*.new` (e.g.
`clonezilla-debian-3.1.2-9-80072992.new`) is an orphan directory with no
`squashfs-root/` and no `menu.ipxe` reference.

## `rebuild.sh`

Runs **on the netboot host**. Matches the current image's compression
(`xz`, 1 MiB block) so size/behaviour do not drift.

```sh
# from a workstation with SSH to y0 (script stays in-repo, runs remotely):
ssh root@10.2.0.3 'bash -s' -- [args] < scripts/live-image/rebuild.sh
```

| Mode | What it does |
|---|---|
| *(default)* `verify` | repack `squashfs-root/` → candidate, then `rsync -c`-diff the candidate against the served image and print exactly what changed. No swap. |
| `--stage` | also publish the candidate + kernel/initrd under `<tree>-candidate/` so you can PXE-boot **one** machine from it before committing. |
| `--swap [--yes]` | install the candidate, keeping the previous image as `filesystem.squashfs.bak`. **Skipped if content-identical** (idempotent). |
| `--sync-from DIR` | `rsync DIR/` into `squashfs-root/` first — the hook `task-095` uses to inject SSH CA trust material. |
| `--tree NAME` | operate on a tree other than the default `…-80072992`. |

Env: `ASSETS_DIR` (default `/opt/stacks/netbootxyz/assets`).

### Boot verification is manual (`task-094` AC#3)

"It repacked" is not "it boots". Never `--swap` a change without first `--stage`
+ booting one machine and confirming sshd:

```sh
ssh root@<machine> 'systemctl is-active ssh && sshd -t && echo SSHD_OK'
```

### Validated (2026-09-15)

`verify` and `--stage` were run against the `…-80072992` tree on `y0`: the
repack succeeds and the candidate is **content-identical** to the served image
(AC#4 — re-running with no source change is a no-op). The `--swap` path executes
for real on the first content change, which lands with `task-095`.
