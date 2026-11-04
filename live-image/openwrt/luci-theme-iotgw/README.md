# luci-theme-iotgw — IoT Gateway NG LuCI theme

The LuCI theme of the IoT Gateway NG OpenWrt gateways. It is a fork of
[luci-theme-argon](https://github.com/jerrykuku/luci-theme-argon) v3.1.2
(Apache-2.0). See [UPSTREAM.md](UPSTREAM.md) for the base commit and the change
list, and [README.argon.md](README.argon.md) / [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
for the upstream documentation, which still applies.

## Look

- Product identity **IoT GW NG · Edge Console** (the local console of a
  gateway; Edge Manager is the central service). Change it per device:
  `uci set argon.@global[0].product_name='…'`, `product_tagline='…'`.
  OpenWrt is not shown, except in LuCI's own pages (e.g. Overview → Firmware Version).

- iotgw-ng palette (`web/styles.css`): orange `#ff6600` accent, navy `#13162b`
  header and text, paper `#f5f4f0` background; dark mode on navy.
- Font: **Victor Mono Nerd Font** (SIL OFL 1.1), subset to Latin, punctuation,
  arrows, box drawing and Powerline glyphs (~50 KB per weight).
- Logo: the iotgw-ng mark (three orange bars); navy/orange browser icons.
- Login background: the industrial factory hall of the iotgw-ng site
  (`web/assets/factory-hero.webp`, generated for the project). Drop more images
  in `/www/luci-static/argon/background/` or upload them in **System → Theme**.
- Tight 2–4 px corners.
- Menu icon `icon/apps.svg` for the **Apps** menu the provisioning adds.

## Build

```sh
just live-image::theme-css   # LESS -> htdocs/luci-static/argon/css/cascade.css
just live-image::theme       # .ipk with the OpenWrt 23.05.4 SDK (docker) -> live-image/dist/theme/
```

Edit the LESS sources, never `cascade.css` by hand; commit both.

## Install

```sh
opkg update && opkg install ./luci-theme-iotgw_*.ipk
```

It replaces upstream Argon (same files): remove `luci-theme-argon` and
`luci-app-argon-config` first. Settings stay in `/etc/config/argon`.
