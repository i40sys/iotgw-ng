---
id: decision-039
title: >-
  039: Gateway LuCI theme — luci-theme-iotgw, an Argon fork branded IoT GW NG
  Edge Console
date: '2026-11-04T17:58:00Z'
status: accepted
---
## Context

The gateways run OpenWrt **23.05.4** (x86-64; the install flow's
`openwrt_version`). Provisioning (iotgw-kestra `tasks/system.yaml`) selected the
stock `bootstrap-dark` LuCI theme. The web UI said "OpenWrt" everywhere and did
not look like the iotgw-ng product (`doc-020` lists
[Argon](https://github.com/jerrykuku/luci-theme-argon) as the wanted base, with
a more industrial look and the i40sys colours).

The owner wants:

- the gateway UI to be **the product's** management UI, not "OpenWrt";
- the iotgw-ng / oriolrius.me palette and logo, the **Victor Mono Nerd Font**,
  and industrial backgrounds instead of Argon's grass;
- the provisioning to install and select it.

## Decision

1. **Fork Argon v3.1.2** (tag commit `7b77b44`, Apache-2.0) into the monorepo as
   `live-image/openwrt/luci-theme-iotgw/`, next to the other gateway-side
   OpenWrt code (`live-image/openwrt/overlay`, the iotgw agent's LuCI page).
   Not a new top-level folder.
2. **Minimal diff to upstream.** Keep the internal names `argon`
   (`/luci-static/argon`, `themes/argon`, `/etc/config/argon`, rpcd
   `luci.argon*`, CSS classes) so upstream fixes merge with little effort. The
   package is **`luci-theme-iotgw`** and **replaces** Argon (same files; opkg
   refuses to install one over the other). `UPSTREAM.md` lists every change.
3. **Product identity: "IoT GW NG · Edge Console"** — the local console of one
   gateway. **Edge Manager** stays the name of the central service (the iotgw-ui
   platform). Both strings come from `/etc/config/argon` (`product_name`,
   `product_tagline`), read by a new ucode module `luci.iotgw-product`. It
   replaces the hostname as brand (sidebar, login, page title, footer); the
   hostname is a small third line, hidden while it is the default `OpenWrt`.
   OpenWrt/LuCI/Argon versions move to the footer's tooltip. LuCI's own pages
   (e.g. Overview → Firmware Version) are not changed.
4. **Look:** iotgw-ng tokens from `web/styles.css` (orange `#ff6600` accent,
   navy `#13162b` header/text, paper `#f5f4f0`, dark mode on navy), Victor Mono
   Nerd Font (OFL; woff2 subset, ~50 KB per weight), 2–4 px corners, the
   three-bar iotgw mark as logo and browser icons, the project's generated
   factory image as login background, an `apps.svg` icon for the provisioning's
   **Apps** menu.
5. **No calls home:** Argon's online updater is **removed** (it would replace
   this package with upstream Argon from GitHub); online wallpapers stay off.
   Translations are dropped (the UI is English only).
6. **Build like upstream:** LESS with lessc 4.1.3 → committed `cascade.css`
   (`just live-image::theme-css`); the `.ipk` with the OpenWrt 23.05.4 SDK in
   docker (`just live-image::theme`). CI (`live-image.yml`, job `theme`) checks
   that `cascade.css` matches its sources and attaches
   `luci-theme-iotgw_all.ipk` + `luci-theme-iotgw-SHA256SUMS` to every `v*`
   release.
7. **Delivery like the iotgw agent:** iotgw-kestra pins the release asset by
   version **and** SHA256 (`vars/iotgw.yml`: `iotgw_theme_version`,
   `iotgw_theme_sha256`); `tasks/luci_theme.yaml` (imported by
   `tasks/system.yaml`, replacing the `bootstrap-dark` task) removes a
   hand-installed Argon, installs the package and selects it.
   `iotgw_theme_src` installs an unreleased build. The iotgw-kestra branch
   `luci-theme-iotgw` is merged only after a release publishes the asset and
   the pin holds its real checksum.

## Consequences

- One more artifact per release; bump the iotgw-kestra pin together with it.
- Upstream Argon updates are manual: diff the new tag against `v3.1.2`, apply,
  keep the `UPSTREAM.md` rows, rebuild.
- The SDK stamps every file with the same date (`SOURCE_DATE_EPOCH`), so
  browsers revalidate same-named files with `304` and keep Argon's cached copy.
  Changed assets need **new file names** (`img/iotgw-bg.webp`, `img/iotgw.svg`).
- Files must be world-readable in the package (uhttpd answers `403`
  otherwise); the harness test checks it.
- A gateway upgraded from upstream Argon keeps its old `/etc/config/argon`
  (opkg writes ours as `argon-opkg`): Argon's colours stay until the file is
  replaced. Provisioned gateways never had Argon, so they get ours.
- LuCI keeps the menu in the browser's `sessionStorage`; after a menu change
  an operator logs out and in again.
