# Upstream

- Project: https://github.com/jerrykuku/luci-theme-argon (Apache-2.0, `LICENSE`)
- Base: tag `v3.1.2`, commit `7b77b44b8324ba4939144760ed3f09c1a1d1e833`
- Not copied: `.github/`, `tests/`, `Screenshots/`, `compat/`, `po/`, Chinese docs,
  release notes.

## Changes from upstream

The internal names stay `argon` (media path `/luci-static/argon`, templates
`themes/argon`, `/etc/config/argon`, rpcd `luci.argon*`, CSS classes). This keeps
upstream merges small. The package is `luci-theme-iotgw` and replaces Argon.

| Area | Change |
|---|---|
| Online updates | Removed: `luci.argon_update`, `update-sources.json`, `argon/updates.js`, its section in `view/argon-config.js` and the ACL entries. They would replace this theme with upstream Argon from GitHub. |
| Translations | Removed (`po/`); the UI is English only. |
| Palette | `less/theme.less`: iotgw-ng tokens; new `header-text` token for the navy header (`less/layout.less` header block). |
| Defaults | `root/etc/config/argon`, `uci-defaults`: primary/dark primary `#ff6600`, lighter blur, more opaque login panel; theme entry `luci.themes.IoTGW`. |
| Font | `less/fonts.less`: Victor Mono Nerd Font (OFL, `fonts/VictorMono-OFL.txt`) replaces Google Sans and TypoGraphica, also in the monospace places. |
| Shape | `less/shape.less`: 2–4 px corners. |
| Alerts | `danger` industrial red `#c8231b`; `error-bg` dark rust with white text; `components/feedback.less`: error alert heading inherits the text colour. |
| Branding | new file names so browsers do not keep cached Argon files (the SDK gives every file the same date): `img/iotgw.svg` (login logo, replaces `img/argon.svg`), favicons, `icon/manifest.json`, `icon/apps.svg`, `img/iotgw-bg.webp`; footer and settings title. |
| Package | `Makefile`: `luci-theme-iotgw`, no translation packages. |
| Product identity | `root/usr/share/ucode/luci/iotgw-product.uc` (+ `header.ut`, `header_login.ut`, `head.ut`, `head_meta.ut`, `sysauth.ut`, `footer*.ut`, `less/iotgw.less`): the brand is **IoT GW NG · Edge Console** (`/etc/config/argon` `product_name` / `product_tagline`) instead of the hostname; the hostname is a small third line, hidden while it is the default `OpenWrt`; page title `<page> · <host> · IoT GW NG Edge Console`; footer `IoT GW NG Edge Console · i40sys` (OpenWrt/LuCI/Argon versions in its tooltip). |

## Updating from upstream

1. Diff the new upstream tag against `v3.1.2` and apply it here.
2. Keep the rows above. Re-run `just live-image::theme-css` and `just live-image::theme`.
