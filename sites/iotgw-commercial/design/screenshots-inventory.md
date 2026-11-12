# Screenshots inventory

Status on 2026-11-12. Source of the web page `src/pages/screenshots.html`
(images in `src/assets/shots/`: `<id>.webp` full, `<id>.thumb.webp` 16:10 top crop).

Raw captures (PNG, 1440×900 @2x) are in the repo root `screenshots/` (not tracked):
Edge Manager ones at the top level, gateway ones in `screenshots/gateway/`.

## Published (45)

| Group | Screens |
|---|---|
| Edge Manager · Inventory (6) | home, domain list, domain detail, device list, device with SSH certificate (warehouse), device waiting for enrolment (lab) |
| Edge Manager · Deployment (8) | start, choose device, saved configuration, stage 1 live boot, stage 2 install OpenWrt, stage 3 reboot & verify, stage 4 services, device activity (empty) |
| Gateway · Console and agent (4) | LuCI sign-in, IoT GW NG agent status, WireGuard, system status |
| Gateway · Monitoring (4) | active routes, processes (top only), real-time load, real-time connections |
| Gateway · Network and security (8) | interfaces, static routes, DHCP/DNS, diagnostics, firewall zones, traffic rules, port forwards, IP sets |
| Gateway · System (9) | system properties, software, startup, mount points, backup/flash, SSH access, theme, LLDP neighbours, LLDP settings |
| Gateway · Containers (6) | Docker overview, containers, images, networks, events (top only), settings |

Gateway captures come from the lab gateway 10.2.0.210 (OpenWrt 23.05.4, iotgw agent v0.7.2).
Before capture the DOM was redacted with `filter: blur()`: public IPv4 addresses,
WireGuard keys, MAC addresses and the customer name in certificate names.

## Captured but not published

| Screen | Reason |
|---|---|
| System log, kernel log | Empty in the full-height capture; also high leak risk |
| Real-time traffic, wireless | Empty graphs (no wireless on this hardware) |
| Docker volumes, NAT rules, SSH keys, scheduled tasks | Empty lists |
| Router password, HTTP(S) access, reboot | Low value |
| Switch, Wireless, Channel analysis, Firewall (iptables), LED configuration | LuCI 404: the module is not installed |
| Firewall custom rules | Falls back to the zones page (duplicate) |
| Apps: Uptime Kuma, VS Code, Alloy, Node-RED, Dockge, Web terminal, Duplicati | Blank: the apps do not run on this gateway |
| Dockge (port 5001) | Not set up: it shows only the "create admin account" page (no account created) |

## Missing (still to capture)

Edge Manager:
- **Deployment debug screens**: "All deployment jobs" list, job detail with live output /
  Ansible-Kestra log, failed job with its error, retry.
- Device activity with real jobs (the current capture is the empty state).
- Global **Activity** page.
- Networks list, network detail, create/edit forms (domain, network, device).
- Settings page, sign-in (Keycloak SSO).
- SSH key generation, SSH-CA enrol / force re-enrol / reset enrolment dialogs.
- One-time code reset, stage 4 with a valid configuration and the "Review provisioning" summary.
- Domain creation with its PKI zone.
- Mobile view.

Gateway:
- System and kernel log with content (viewport capture, redacted).
- Apps running: Node-RED, Uptime Kuma, Grafana Alloy, Duplicati, VS Code, web terminal, Dockge with stacks.
- Console TUI on the serial port / screen (`iotgw status`) and the live-image bootstrap TUI.

Platform:
- Kestra flows and executions, observability dashboards (Grafana).
