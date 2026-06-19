---
id: doc-014
title: OpenWRT Wireguard Setup Guide
type: other
created_date: "2025-12-04 06:25"
---

# OpenWRT Wireguard Setup Guide

> **Note:** The `PrivateKey` / `private_key` values below are a redacted placeholder (`REDACTED_EXAMPLE_PRIVATE_KEY_...`). The original was a real device key and is now considered compromised — see `decision-014` (secrets handling/rotation). The example Network ID UUID is illustrative only.

## wg0.conf

```bash
# WireGuard VPN Configuration File, device_id: iotgw-m1@951dfe21

# Device metadata

# Name: iotgw-m1

# Network ID: 951dfe21-4de9-46a7-947d-8569bf1a8aba

# Description:

# Last updated: 2025-12-04T05:12:18.341651+00:00

[Interface]
Address = 10.121.101.254/32
PrivateKey = REDACTED_EXAMPLE_PRIVATE_KEY_xxxxxxxxxxxxxxxxxxxx=
MTU = 1420

# DevicePublicKey = FTHRZN/uH/K8VBms86bzGbx6ByLAbHjIIcWLJHx9J0c=

# Route configuration for public IP

PreUp = ip route del default || true
PreUp = ip route add 216.45.62.117 via 10.2.0.1 dev wg0 || true
PostDown = ip route del 216.45.62.117 via 10.2.0.1 dev wg0 || true
PostDown = ip route add default via 10.2.0.1 || true

[Peer]
PublicKey = MVrf5pB0sPD9pQjV62NDxJNfBuJj2borv9kv8Ba4NiY=
Endpoint = 216.45.62.117:443
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 20
```

## OpenWRT packages

```bash
wrieguard-tools
luci-proto-wireguard
```

### /etc/config/firewall

```bash
config zone
option name 'vpn'
list network 'wg0'
option input 'ACCEPT'
option output 'ACCEPT'
option forward 'ACCEPT'
option masq '1'
```

### /etc/config/network

```bash
config interface 'wg0'
option proto 'wireguard'
option private_key 'REDACTED_EXAMPLE_PRIVATE_KEY_xxxxxxxxxxxxxxxxxxxx='
list addresses '10.121.101.254/32'
option metric '5'

config wireguard_wg0 'wgserver'
option public_key 'MVrf5pB0sPD9pQjV62NDxJNfBuJj2borv9kv8Ba4NiY='
option endpoint_port '443'
option persistent_keepalive '25'
option route_allowed_ips '1'
list allowed_ips '0.0.0.0/0'
option endpoint_host '216.45.62.117'
option description 'netmaker.i40sys.com'

config route
option interface 'wan' # your WAN interface name
option target '216.45.62.117'
option netmask '255.255.255.255'
option gateway '10.2.0.1'
```
