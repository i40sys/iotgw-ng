# netmaker_management Module

## Synopsis

Manage Netmaker networks and external client devices via the Netmaker API.

This module provides comprehensive management of Netmaker WireGuard mesh networks, including:
- Creating and managing virtual networks
- Managing external client devices (WireGuard configs)
- Auto-discovery of ingress gateways
- Fully idempotent operations

## Requirements

- Python >= 3.6
- requests library
- Access to a Netmaker API server
- Master key or username/password for authentication

## Parameters

See the main README.md for detailed parameter documentation.

## Examples

### Create a Network

```yaml
- name: Create IoT network
  oriolrius.netmaker.netmaker_management:
    resource_type: network
    name: iot-network
    state: present
    base_url: https://api.netmaker.example.com
    master_key: "{{ netmaker_master_key }}"
    addressrange: "10.102.0.0/24"
    defaultmtu: 1420
    defaultkeepalive: 25
```

### Create External Client Device

```yaml
- name: Create IoT sensor device
  oriolrius.netmaker.netmaker_management:
    resource_type: extclient
    name: sensor-01
    network: iot-network
    ingress_gateway_id: auto
    state: present
    base_url: https://api.netmaker.example.com
    master_key: "{{ netmaker_master_key }}"
    enabled: true
```

### Delete a Device

```yaml
- name: Delete obsolete device
  oriolrius.netmaker.netmaker_management:
    resource_type: extclient
    name: old-sensor
    network: iot-network
    state: absent
    base_url: https://api.netmaker.example.com
    master_key: "{{ netmaker_master_key }}"
```

## Return Values

- **changed** (bool): Whether the resource was modified
- **resource** (dict): Full resource data when state is present
- **msg** (string): Human-readable status message

## Authors

- Oriol Rius
