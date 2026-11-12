# Screenshots (raw captures)

Full-size PNG sources of the captures on the commercial site's Screenshots page
(`sites/iotgw-commercial/src/pages/screenshots.html`). The PNGs are Git LFS objects.

- `*.png` — Edge Manager (iotgw-ui) with demo data.
- `gateway/*.png` — LuCI on the LAN demo gateway. Public IPs, WireGuard keys, MACs and
  customer names were blurred in the page before capture.

All raw captures are here, also the ones the site does not show (empty logs, password,
SSH keys, reboot, full process and Docker event lists). They were checked before commit:
no public IPs, keys or customer names. `estats.json` holds the element boxes used to
annotate the Edge Manager captures. Inventory and gaps:
`sites/iotgw-commercial/design/screenshots-inventory.md`.
