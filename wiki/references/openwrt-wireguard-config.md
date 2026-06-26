---
title: OpenWRT WireGuard Config
category: references
tags: [vpn/wireguard, provisioning/openwrt, status/current]
sources:
  - backlog/docs/doc-014 - OpenWRT Wireguard.md
relationships:
  - target: "[[entities/netmaker]]"
    type: related_to
summary: Reference OpenWRT WireGuard setup — wg0.conf, the network/firewall UCI config, and the route trick for the public endpoint; device keys are redacted/compromised.
provenance:
  extracted: 0.92
  inferred: 0.03
  ambiguous: 0.05
base_confidence: 0.45
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: peripheral
created: 2026-06-26
updated: 2026-06-26
---

# OpenWRT WireGuard Config

Reference for configuring a WireGuard tunnel on an OpenWRT gateway against the
Netmaker endpoint ([[entities/netmaker]]).

> [!warning] Keys redacted / compromised
> The `PrivateKey` / `private_key` values in doc-014 are a redacted placeholder
> (`REDACTED_EXAMPLE_PRIVATE_KEY_…`). The original was a real device key and is
> now considered **compromised** (see [[synthesis/secret-exposure-rotation-runbook]]).
> The example Network ID UUID is illustrative only.

## Shape

- **`wg0.conf`** — `[Interface]` with `Address`, `PrivateKey`, `MTU=1420`; a
  `[Peer]` with the server `PublicKey`, `Endpoint = 216.45.62.117:443`,
  `AllowedIPs = 0.0.0.0/0`, `PersistentKeepalive`. A `PreUp`/`PostDown` **route
  trick** pins a host route to the public endpoint via `10.2.0.1` so the default
  route can be flipped onto the tunnel.
- **UCI `/etc/config/network`** — a `proto 'wireguard'` interface `wg0` plus a
  `wireguard_wg0 'wgserver'` peer (`endpoint_host`, `endpoint_port '443'`,
  `route_allowed_ips '1'`, `allowed_ips '0.0.0.0/0'`) and a static `route` to the
  endpoint via the WAN gateway.
- **UCI `/etc/config/firewall`** — a `vpn` zone over `wg0` with `masq '1'`.
- **Packages:** `wireguard-tools`, `luci-proto-wireguard`.

## Sources

*Original backlog documents this page distills (browsable in-vault via `_sources/`).*

- [[_sources/docs/doc-014 - OpenWRT Wireguard|doc-014 - OpenWRT Wireguard]]
