---
id: TASK-161
title: 'LuCI theme for the gateways: luci-theme-iotgw (IoT GW NG Edge Console)'
status: Done
assignee: []
created_date: '2026-11-04T17:59:00Z'
updated_date: '2026-11-04T18:31:00Z'
labels:
  - openwrt
  - luci
  - ui
  - provisioning
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Goal:** the gateways' web UI is the product's management UI —
**IoT GW NG · Edge Console** — not stock OpenWrt (`decision-039`).

**Scope**

- Fork Argon v3.1.2 into `live-image/openwrt/luci-theme-iotgw/`, rebrand it
  (palette, Victor Mono Nerd Font, logo, industrial background, product name).
- Build the `.ipk` with the OpenWrt 23.05.4 SDK (`just live-image::theme`) and
  publish it with every `v*` release (CI `live-image.yml`, job `theme`).
- iotgw-kestra provisioning installs and selects it instead of `bootstrap-dark`.

**Context:** found while checking the LuCI menu of the QEMU e2e gateway
(`KEEP=1 just e2e` in `live-image/`); the provisioning's **Apps** menu
(`files/apps.lua`, needs `luci-compat`) works on 23.05.4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Fork in live-image/openwrt/luci-theme-iotgw with UPSTREAM.md listing every change from Argon v3.1.2
- [x] #2 No OpenWrt branding in the theme's own UI: brand, login, page title and footer show IoT GW NG Edge Console (configurable in /etc/config/argon)
- [x] #3 iotgw-ng palette, Victor Mono Nerd Font, iotgw logo and an industrial login background; online updater removed
- [x] #4 just live-image::theme builds luci-theme-iotgw .ipk with the OpenWrt 23.05.4 SDK; CI attaches it and its SHA256SUMS to v* releases
- [x] #5 iotgw-kestra tasks/luci_theme.yaml installs and selects the pinned release package; harness test_luci_theme.yaml passes twice
- [x] #6 iotgw-kestra pin set to a real release version and checksum, branch luci-theme-iotgw merged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fork Argon v3.1.2 into `live-image/openwrt/luci-theme-iotgw/` (read upstream
   README + `docs/DEVELOPMENT.md` first; minimal diff, internal names stay `argon`).
2. Rebrand: palette, font, shape, logo/icons, background, product identity.
3. Build with the OpenWrt 23.05.4 SDK (`just theme`); CI job publishes it.
4. iotgw-kestra: `tasks/luci_theme.yaml` replaces the `bootstrap-dark` task;
   release pin in `vars/iotgw.yml`; harness test.
5. Merge the iotgw-kestra branch after a release carries the package.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Status 2026-11-04:** ACs 1–5 done; AC 6 waits for an iotgw-ng `v*` release.

**iotgw-ng (this repo)**

- `live-image/openwrt/luci-theme-iotgw/` — the fork. `README.md` (look, build,
  install) and `UPSTREAM.md` (base commit + table of every change).
- Product identity: new ucode module `luci.iotgw-product`
  (`/etc/config/argon`: `product_name` = `IoT GW NG`, `product_tagline` =
  `Edge Console`) used by `header.ut`, `header_login.ut`, `head_meta.ut`,
  `sysauth.ut`, `footer*.ut`; styles in `less/iotgw.less`.
- Look: `less/theme.less` tokens (orange `#ff6600`, navy `#13162b`, paper
  `#f5f4f0`, `header-text`, industrial red `danger`, rust error alerts),
  `less/fonts.less` (Victor Mono Nerd Font woff2 subset, OFL),
  `less/shape.less` (2–4 px), `img/iotgw.svg`, favicons, `icon/apps.svg`,
  `img/iotgw-bg.webp` (= `web/assets/factory-hero.webp`).
- Removed: online updater (`luci.argon_update`, `update-sources.json`,
  `argon/updates.js` + its settings section and ACL), `po/`.
- `live-image/justfile`: `theme-css`, `theme`. CI: `live-image.yml` job
  `theme` (cascade.css drift check, attest, release assets
  `luci-theme-iotgw_all.ipk` + `luci-theme-iotgw-SHA256SUMS`).
- Docs: `decision-039`, `live-image/README.md` (layout, recipes, CI).

**iotgw-kestra (branch `luci-theme-iotgw`, not committed/merged yet)**

- `tasks/luci_theme.yaml`: download pinned `.ipk` (or `iotgw_theme_src`),
  remove upstream Argon, `opkg install`, select (`luci.main.mediaurlbase`,
  `luci.themes.IoTGW`), clear the LuCI cache. Imported by `tasks/system.yaml`
  in place of the `bootstrap-dark` task.
- `vars/iotgw.yml`: `iotgw_theme_version` / `iotgw_theme_sha256` /
  `iotgw_theme_url` — **placeholders** (`vNEXT`, zeros).
- `i11_provisioning_iotgw.yaml`: `vars_files: vars/iotgw.yml`.
- `tests/harness/test_luci_theme.yaml` (+ README row): passes twice with the
  local `.ipk`; the second import is a no-op.
- `tasks/dockge.yaml` has an unrelated local change — not part of this task.

**Verified**

- QEMU e2e gateway (OpenWrt 23.05.4, `KEEP=1 just e2e`): login, Overview,
  Status → IoGW NG, Apps menu render with the theme; no "OpenWrt" in the
  theme's UI (title, brand, footer).
- Harness: installed, Argon absent, selected, product module present, every
  asset world-readable.

**Gotchas found**

- SDK `SOURCE_DATE_EPOCH` → same mtime for all files → browsers keep cached
  same-named Argon files (`304`): renamed `bg1.webp` → `iotgw-bg.webp`.
- Files created `0600` → uhttpd `403` (fixed; harness checks it).
- `luci.mk` has no `CONFLICTS` hook; opkg refuses the file clash anyway.
- Argon → ours upgrade keeps the old `/etc/config/argon` (`argon-opkg`).
- LuCI caches the menu in `sessionStorage`: log out/in after menu changes.
- `just e2e` needs `/usr/sbin` on `PATH`; `/dev/kvm` not usable → TCG.

**Remaining (AC 6)**

1. Commit + tag an iotgw-ng `v*` release → CI attaches the `.ipk`.
2. Set `iotgw_theme_version` + `iotgw_theme_sha256` from the release's
   `luci-theme-iotgw-SHA256SUMS`; run the harness without `iotgw_theme_src`.
3. Merge iotgw-kestra `luci-theme-iotgw`; sync the Kestra namespace files.

**How the QEMU test gateway was run (reuse this, do not hand-build a VM)**

- Start (from the repo root), VMs left running after the e2e test:
  `cd live-image && PATH="$PATH:/usr/sbin:/sbin" KEEP=1 just e2e`
  - `test/qemu/run.sh`: two OpenWrt 23.05.4 VMs (`hub` = site router +
    Netmaker stand-in, `gw` = installed gateway with the iotgw agent) +
    `fakeapi`; work dir `live-image/test/qemu/.work/`.
  - `/usr/sbin` on `PATH`: `sfdisk`/`debugfs` live there.
  - No `/dev/kvm` access for the user → TCG (slow; ~25 min for the test).
- Reach it: gw LuCI `http://127.0.0.1:12224` (root, empty password), gw ssh
  `ssh -p 12222 -i live-image/test/qemu/.work/scn/mgmt root@127.0.0.1`
  (dropbear, no python: the provisioning playbooks do NOT run against it —
  use the iotgw-kestra harness), hub ssh `-p 12221`.
- Theme on it by hand: copy the `.ipk` over ssh, `opkg remove` Argon,
  `opkg install`, `uci set luci.main.mediaurlbase=/luci-static/argon`.
- Stop: the run prints the PIDs (`kill <pids> when done`); otherwise
  `ps -eo pid,args | grep -E 'qemu-system|fakeapi serve'` and kill the
  processes whose cwd is `live-image/test/qemu/.work`. Stopped 2026-11-04.

**Release:** v0.9.0 carries the theme (`deploy/releases/v0.9.0.md`).

**Released and pinned (2026-11-04)**

- iotgw-ng `v0.9.0` (tag on `d99b03d`): CI `live-image` job `theme` green;
  release assets `luci-theme-iotgw_all.ipk` + `luci-theme-iotgw-SHA256SUMS`
  (`ece16feedefe3cbad9b538bdf9084d77c8a50ff64cd4ed74a2abcc67eb9943d5`).
- iotgw-kestra `dbc4781` on `main` (fast-forward on `origin/main`):
  `iotgw_theme_version: v0.9.0` + that checksum. The harness passes twice
  against the release asset (download + checksum + install + checks).
- The local `~/iotgw-kestra` `main` was a stale pre-rebase history (64
  commits, all present rebased on `origin/main`): reset to `origin/main`,
  old tip kept as branch `backup/main-stale-2026-11-04`. The user's one-line
  `tasks/dockge.yaml` edit is in `git stash` ("user: dockge.yaml …").
- Kestra picks the flows up through the scheduled `sync-namespace-files`
  (GitHub `i40sys/iotgw-kestra` main). The next provisioning of a gateway
  (`system` tag) installs and selects the theme.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The gateways' LuCI is now **IoT GW NG · Edge Console**: `luci-theme-iotgw`
(Argon v3.1.2 fork, `live-image/openwrt/luci-theme-iotgw`, decision-039),
built with the OpenWrt 23.05.4 SDK, published with iotgw-ng v0.9.0 and
installed by the iotgw-kestra provisioning (pinned version + SHA256) instead
of `bootstrap-dark`.
<!-- SECTION:FINAL_SUMMARY:END -->
