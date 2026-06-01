# Netmaker Ansible Management

Comprehensive Ansible automation for managing Netmaker networks and external client devices via the Netmaker API. This module provides unified, idempotent infrastructure-as-code for your Netmaker WireGuard mesh networks.

## Features

- Unified module for networks and external client devices
- Fully idempotent operations - safe to run multiple times
- Complete CRUD lifecycle (Create, Read, Update, Delete)
- Auto-discovery of ingress gateways
- WireGuard config files for devices without netclient software
- Check mode (dry-run) capability
- Modern tooling with Python UV and Just task runner
- Both master key and username/password authentication
- SSL/TLS certificate validation control

## Installation

### Option 1: Install from Ansible Galaxy (Recommended)

```bash
# Install the collection from Ansible Galaxy
ansible-galaxy collection install oriolrius.netmaker
```

### Option 2: Install from Source

```bash
# Clone the repository
git clone https://github.com/oriolrius/netmaker-ansible-automation.git
cd netmaker-ansible-automation

# Install UV package manager (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install project dependencies
just install
```

## Quick Start

### 1. Configure Credentials

Create a `.env` file from the example template:

```bash
cp .env.example .env
```

Edit `.env` and add your Netmaker credentials:

```bash
# .env
NETMAKER_ENDPOINT=https://api.netmaker.example.com
NETMAKER_MASTER_KEY=your_actual_master_key_here
```

**Important:** The `.env` file contains sensitive credentials and should never be committed to version control. Make sure it's listed in `.gitignore`.

### 2. Use in Your Playbooks

```yaml
---
- name: Manage Netmaker Infrastructure
  hosts: localhost
  tasks:
    - name: Create IoT network
      oriolrius.netmaker.netmaker_management:
        resource_type: network
        name: iot-network
        state: present
        base_url: https://api.netmaker.example.com
        master_key: "{{ netmaker_master_key }}"
        addressrange: "10.102.0.0/24"
        defaultmtu: 1420

    - name: Create IoT device
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

### 3. Run Commands (For Source Installation)

```bash
# List all available commands
just

# Network operations
just create                  # Create networks from playbook
just delete my-network       # Delete specific network

# Device operations
just manage-devices          # Create/update external client devices
just delete-device sensor-01 # Delete specific device
```

## Finding Your Master Key

The master key is the recommended authentication method for automation. To find it:

```bash
# SSH to your Netmaker server
ssh your-netmaker-server

# Look for MASTER_KEY in your configuration
grep MASTER_KEY docker-compose.yml
# or
grep MASTER_KEY netmaker.env
```

## Understanding Netmaker Architecture

Netmaker has three types of resources:

1. **Networks** - Virtual WireGuard networks (managed via API)
2. **External Clients (Devices)** - WireGuard devices that get config files without netclient software (managed via API)
3. **Hosts** - Servers running the netclient software (auto-registered, not created via API)

This module manages **Networks** and **External Client Devices** - perfect for IoT devices, phones, laptops, and any device that needs WireGuard access without installing netclient.

## Module Reference: `netmaker_management`

This custom Ansible module manages networks and external client devices through a unified interface.

### Common Parameters

All operations require these base parameters:

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| `resource_type` | Yes | str | - | Resource type: `network` or `extclient` |
| `name` | Yes | str | - | Resource name/identifier |
| `state` | No | str | `present` | `present` to create/update, `absent` to delete |
| `base_url` | Yes | str | - | Netmaker API URL (e.g., https://api.netmaker.example.com) |
| `master_key` | No* | str | - | Master key for authentication |
| `username` | No* | str | `oriol` | Username for user/password authentication |
| `password` | No* | str | - | Password for user/password authentication |
| `validate_certs` | No | bool | `true` | Validate SSL certificates |

*Either `master_key` or `password` is required for authentication.

### Network-Specific Parameters

Use these parameters when `resource_type: network`:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `addressrange` | str | - | IPv4 CIDR range (e.g., "10.100.0.0/24") |
| `addressrange6` | str | - | IPv6 CIDR range |
| `defaultmtu` | int | - | Default MTU size for the network |
| `defaultkeepalive` | int | - | Default keepalive interval in seconds |
| `defaultextclientdns` | str | - | Default external client DNS server |
| `defaultinterface` | str | - | Default network interface |
| `defaultpostdown` | str | - | Command to run after interface goes down |
| `defaultpostup` | str | - | Command to run after interface comes up |
| `islocal` | bool | `false` | Whether this is a local-only network |

### External Client (Device) Parameters

Use these parameters when `resource_type: extclient`:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `network` | str | - | **Required**. Network ID the device should join |
| `ingress_gateway_id` | str | `auto` | Gateway node ID (use `auto` for automatic discovery) |
| `dns` | str | - | DNS server for the device |
| `extraallowedips` | list | - | Additional allowed IPs for routing |
| `enabled` | bool | `true` | Whether the device is enabled |
| `postup` | str | - | Command to run after WireGuard interface comes up |
| `postdown` | str | - | Command to run after WireGuard interface goes down |

### Return Values

The module returns structured data you can use in subsequent tasks:

| Key | Type | Description |
|-----|------|-------------|
| `changed` | bool | Whether the resource was modified |
| `resource` | dict | Full resource data (when state is present) |
| `msg` | str | Human-readable status message |

## Usage Examples

### Network Management

#### Create a Network

```yaml
- name: Create IoT network
  netmaker_management:
    resource_type: network
    name: iot-network
    state: present
    base_url: "{{ netmaker_url }}"
    master_key: "{{ netmaker_master_key }}"
    addressrange: "10.102.0.0/24"
    defaultmtu: 1420
    defaultkeepalive: 25
```

#### Update Network Configuration

```yaml
- name: Update network MTU
  netmaker_management:
    resource_type: network
    name: iot-network
    state: present
    base_url: "{{ netmaker_url }}"
    master_key: "{{ netmaker_master_key }}"
    defaultmtu: 1280  # Change MTU
```

#### Delete a Network

```yaml
- name: Delete network
  netmaker_management:
    resource_type: network
    name: old-network
    state: absent
    base_url: "{{ netmaker_url }}"
    master_key: "{{ netmaker_master_key }}"
```

### External Client Device Management

External clients are WireGuard devices that connect to your network without needing the netclient software. Perfect for IoT devices, phones, laptops, etc.

#### Create a Device

```yaml
- name: Create IoT sensor device
  netmaker_management:
    resource_type: extclient
    name: sensor-01
    network: iot-network
    ingress_gateway_id: auto  # Automatically find ingress gateway
    state: present
    base_url: "{{ netmaker_url }}"
    master_key: "{{ netmaker_master_key }}"
    enabled: true
```

#### Create Multiple Devices

```yaml
- name: Create IoT devices
  netmaker_management:
    resource_type: extclient
    name: "{{ item }}"
    network: iot-network
    ingress_gateway_id: auto
    state: present
    base_url: "{{ netmaker_url }}"
    master_key: "{{ netmaker_master_key }}"
    enabled: true
  loop:
    - sensor-01
    - sensor-02
    - camera-01
    - gateway-device
```

#### Create Device with Specific Gateway

```yaml
- name: Create device with specific ingress gateway
  netmaker_management:
    resource_type: extclient
    name: special-device
    network: iot-network
    ingress_gateway_id: "bef77574-f11e-46cf-b1c1-98888a2189c4"
    state: present
    base_url: "{{ netmaker_url }}"
    master_key: "{{ netmaker_master_key }}"
    dns: "8.8.8.8"
    enabled: true
```

#### Update Device Configuration

```yaml
- name: Disable device temporarily
  netmaker_management:
    resource_type: extclient
    name: sensor-01
    network: iot-network
    state: present
    base_url: "{{ netmaker_url }}"
    master_key: "{{ netmaker_master_key }}"
    enabled: false
```

#### Delete a Device

```yaml
- name: Delete obsolete device
  netmaker_management:
    resource_type: extclient
    name: old-sensor
    network: iot-network
    state: absent
    base_url: "{{ netmaker_url }}"
    master_key: "{{ netmaker_master_key }}"
```

### Complete Infrastructure Example

```yaml
- name: Deploy IoT infrastructure
  hosts: localhost
  vars:
    netmaker_url: "https://api.netmaker.example.com"
    netmaker_master_key: "{{ lookup('env', 'NETMAKER_MASTER_KEY') }}"

  tasks:
    # Create network
    - name: Create IoT network
      netmaker_management:
        resource_type: network
        name: iot-network
        state: present
        base_url: "{{ netmaker_url }}"
        master_key: "{{ netmaker_master_key }}"
        addressrange: "10.102.0.0/24"
        defaultmtu: 1420
        defaultkeepalive: 25

    # Deploy devices
    - name: Create IoT devices
      netmaker_management:
        resource_type: extclient
        name: "{{ item.name }}"
        network: iot-network
        ingress_gateway_id: auto
        state: present
        base_url: "{{ netmaker_url }}"
        master_key: "{{ netmaker_master_key }}"
        enabled: true
      loop:
        - { name: 'sensor-01' }
        - { name: 'sensor-02' }
        - { name: 'camera-01' }
        - { name: 'controller-01' }
```

## Just Command Reference

The `justfile` provides convenient shortcuts for common operations:

### Setup Commands

```bash
just install             # Install Python dependencies with UV
just check               # Verify Ansible installation
```

### Network Commands

```bash
just create              # Create networks (uses playbook vars)
just delete my-network   # Delete specific network by name
just create-check        # Dry run for create networks
just create-verbose      # Create networks with verbose output
```

### Device Commands

```bash
just manage-devices      # Create/update devices (uses playbook vars)
just devices-check       # Dry run for manage devices
just devices-verbose     # Manage devices with verbose output
```

### Utility Commands

```bash
just run playbook.yml [args]  # Run any playbook with custom arguments
just lint                     # Syntax check all playbooks
just clean                    # Clean Python cache files
```

## Sample Playbooks Reference

The module includes sample playbooks in the `playbooks/` directory:

### create_network.yml

Creates or updates Netmaker networks.

**Usage:**
```bash
just create
# or
uv run ansible-playbook playbooks/create_network.yml
```

**What it does:**
- Creates networks with defined IPv4 address ranges
- Sets MTU and keepalive defaults
- Idempotent - safe to run multiple times

### delete_network.yml

Deletes a specific network by name.

**Usage:**
```bash
just delete my-network
# or
uv run ansible-playbook playbooks/delete_network.yml -e network_name=my-network
```

**Warning:** Deleting a network will disconnect all devices from that network.

### manage_devices.yml

Creates or updates external client devices.

**Usage:**
```bash
just manage-devices
# or
uv run ansible-playbook playbooks/manage_devices.yml
```

**What it does:**
- Creates WireGuard device configurations
- Auto-discovers ingress gateways
- Assigns IP addresses automatically
- Updates existing device configurations
- Fully idempotent

**Configuration:** Edit the `tasks` section to define your devices.

## Authentication

### Master Key (Recommended)

This project uses master key authentication exclusively. The master key is loaded automatically from the `.env` file.

**Setup:**

1. Create `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

2. Add your master key to `.env`:
   ```bash
   NETMAKER_ENDPOINT=https://api.netmaker.example.com
   NETMAKER_MASTER_KEY=your_actual_master_key_here
   ```

3. Run commands - the master key is automatically loaded:
   ```bash
   just create
   just manage-devices
   ```

**How It Works:**

The `justfile` automatically loads the `NETMAKER_MASTER_KEY` from `.env` and passes it to all Ansible playbooks. You don't need to specify it manually.

**Manual Override:**

If needed, you can override the master key on the command line:
```bash
uv run ansible-playbook playbooks/create_network.yml \
  -e netmaker_master_key=different_key
```

## Idempotency

The module is fully idempotent - you can safely run the same playbook multiple times:

```bash
# First run - creates devices
just manage-devices
# Output: changed=true for new devices

# Second run - no changes needed
just manage-devices
# Output: changed=false, devices already exist

# Edit playbook to disable a device, then run
just manage-devices
# Output: changed=true (updates that device)
```

The module automatically:
- Detects existing resources
- Compares desired vs actual configuration
- Only makes changes when needed
- Reports accurate changed status

## Troubleshooting

### Module Not Found Error

**Symptom:** `ERROR! couldn't resolve module/action 'netmaker_management'`

**Solution:** Ensure you're running commands from the correct directory:
```bash
cd /home/oriol/iotgw-ng/ansible/netmaker
ls ansible.cfg  # Must exist
```

### Missing Dependencies

**Symptom:** `ModuleNotFoundError: No module named 'requests'`

**Solution:**
```bash
just install
```

### SSL Certificate Errors

**Symptom:** `SSL: CERTIFICATE_VERIFY_FAILED`

**Solution:** For development/testing only:
```yaml
validate_certs: false
```

**Warning:** Never disable certificate validation in production.

### Authentication Errors

**Symptom:** `Authentication failed` or `401 Unauthorized`

**Solution:** Verify your master key:
```bash
# On Netmaker server
ssh your-netmaker-server
grep MASTER_KEY docker-compose.yml
```

### No Ingress Gateway Found

**Symptom:** `No ingress gateway found in network`

**Solution:** Ensure your network has at least one node configured as an ingress gateway. You can check this via the Netmaker UI or by listing nodes and looking for `isingressgateway: true`.

### Debug Mode

Enable verbose output to see detailed API interactions:
```bash
just create-verbose
# or
uv run ansible-playbook playbooks/manage_devices.yml -vvv
```

## Project Structure

```
ansible/netmaker/
├── README.md                      # This file
├── justfile                       # Task runner with command shortcuts
├── ansible.cfg                    # Ansible configuration
├── pyproject.toml                 # Python dependencies (UV)
├── .env.example                   # Example environment configuration
├── .env                           # Your actual credentials (DO NOT COMMIT)
├── library/
│   └── netmaker_management.py     # Main Ansible module
└── playbooks/
    ├── create_network.yml         # Create/update networks
    ├── delete_network.yml         # Delete network by name
    ├── manage_devices.yml         # Create/update external client devices
    └── delete_device.yml          # Delete device by name
```

**Security Note:** Always ensure `.env` is listed in `.gitignore` to prevent committing sensitive credentials.

## Best Practices

### 1. Keep Credentials Secure

- Never commit `.env` to version control
- Use `.env.example` as a template for others
- Store production credentials in secure vaults (HashiCorp Vault, AWS Secrets Manager, etc.)
- Rotate master keys periodically

### 2. Always Test with Check Mode First

Preview changes before applying them:
```bash
just devices-check
```

### 3. Use Auto Gateway Discovery

Let the module find the ingress gateway automatically:
```yaml
ingress_gateway_id: auto  # Recommended
```

### 4. Organize Devices with Naming Conventions

Use consistent naming for easy management:
```yaml
- sensor-01, sensor-02, sensor-03  # Environment sensors
- camera-01, camera-02             # Security cameras
- controller-main, controller-backup # Control systems
```

### 5. Use Version Control Wisely

Always keep `.env` out of version control:
```bash
# Add to .gitignore
echo ".env" >> .gitignore
```

## How to Get WireGuard Configs

After creating external client devices with this module, you can download their WireGuard configuration files from:

1. **Netmaker UI**: Navigate to External Clients section
2. **API**: `GET /api/extclients/{network}/{clientid}/conf`
3. **CLI on Netmaker server**

These configs can be imported into any WireGuard client (phone app, desktop, IoT device, etc.).

## Resources

- [Ansible Galaxy Collection](https://galaxy.ansible.com/ui/repo/published/oriolrius/netmaker/)
- [GitHub Repository](https://github.com/oriolrius/netmaker-ansible-automation)
- [Netmaker Documentation](https://docs.netmaker.io/)
- [Netmaker API Reference](https://docs.netmaker.io/api.html)
- [Ansible Module Development](https://docs.ansible.com/ansible/latest/dev_guide/developing_modules_general.html)
- [UV Package Manager](https://github.com/astral-sh/uv)
- [Just Command Runner](https://just.systems/)
- [WireGuard](https://www.wireguard.com/)

## Development

### Releasing a New Version

This project uses GitHub Actions to automatically publish to Ansible Galaxy when versions are updated.

#### Steps to Release:

1. **Bump the version** in both `galaxy.yml` and `pyproject.toml`:
   ```bash
   # Using the helper script
   just bump-version 1.1.0

   # Or manually edit both files
   ```

2. **Commit and push** the version change:
   ```bash
   git add galaxy.yml pyproject.toml
   git commit -m "Bump version to 1.1.0"
   git push origin main
   ```

3. **GitHub Actions will automatically**:
   - Verify versions match between `galaxy.yml` and `pyproject.toml`
   - Build the collection
   - Publish to Ansible Galaxy with `--force` flag
   - Create a GitHub Release with the collection tarball

#### Version Checking

The workflow ensures version alignment:
- Compares `galaxy.yml` version with `pyproject.toml` version
- Fails if versions don't match
- Only publishes when versions are synchronized

#### Manual Workflow Trigger

You can also manually trigger the workflow from GitHub Actions tab.

## License

GNU General Public License v3.0+

## Version

Collection Version: 1.0.0
Documentation Updated: 2025-10-16
