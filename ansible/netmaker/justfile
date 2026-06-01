# Netmaker Ansible Module - Task Runner
# Manages Netmaker networks and external client devices via Ansible playbooks
# Run 'just' or 'just --list' to see all available commands

# Load master key from .env file
export NETMAKER_MASTER_KEY := `grep 'NETMAKER_MASTER_KEY=' .env | cut -d'=' -f2`

# Show this help message with all available commands
default:
    @just --list

# ============================================================================
# SETUP & VERIFICATION
# ============================================================================

# Install Python dependencies using UV package manager
install:
    @echo "📦 Installing dependencies with UV..."
    uv sync
    @echo "✓ Dependencies installed"

# Verify Ansible installation and show version
check:
    @echo "🔍 Checking Ansible installation..."
    uv run ansible --version

# ============================================================================
# NETWORK MANAGEMENT
# ============================================================================

# Create or update networks (edit playbooks/create_network.yml to configure)
create:
    @echo "🌐 Creating/updating Netmaker networks..."
    uv run ansible-playbook playbooks/create_network.yml -e netmaker_master_key="${NETMAKER_MASTER_KEY}"

# Delete a specific network by name
# Example: just delete my-network
delete network_name:
    @echo "🗑️  Deleting network: {{network_name}}"
    uv run ansible-playbook playbooks/delete_network.yml -e network_name={{network_name}} -e netmaker_master_key="${NETMAKER_MASTER_KEY}"

# Dry run: Preview network creation without making changes
create-check:
    @echo "🔍 Dry run: Checking what would be created..."
    uv run ansible-playbook playbooks/create_network.yml -e netmaker_master_key="${NETMAKER_MASTER_KEY}" --check

# Create networks with verbose output for debugging
create-verbose:
    @echo "📢 Creating networks with verbose output..."
    uv run ansible-playbook playbooks/create_network.yml -e netmaker_master_key="${NETMAKER_MASTER_KEY}" -vvv

# ============================================================================
# DEVICE MANAGEMENT (External Clients)
# ============================================================================

# Create or update external client devices (edit playbooks/manage_devices.yml)
# External clients are WireGuard devices without netclient software
manage-devices:
    @echo "📱 Managing external client devices..."
    uv run ansible-playbook playbooks/manage_devices.yml -e netmaker_master_key="${NETMAKER_MASTER_KEY}"

# Delete a specific device from a network
# Example: just delete-device sensor-01
# Example: just delete-device camera-01 prod-network
delete-device device_name network="iot-network":
    @echo "🗑️  Deleting device: {{device_name}} from network: {{network}}"
    uv run ansible-playbook playbooks/delete_device.yml -e device_name={{device_name}} -e network={{network}} -e netmaker_master_key="${NETMAKER_MASTER_KEY}"

# Dry run: Preview device changes without making them
devices-check:
    @echo "🔍 Dry run: Checking what devices would be created/updated..."
    uv run ansible-playbook playbooks/manage_devices.yml -e netmaker_master_key="${NETMAKER_MASTER_KEY}" --check

# Manage devices with verbose output for debugging
devices-verbose:
    @echo "📢 Managing devices with verbose output..."
    uv run ansible-playbook playbooks/manage_devices.yml -e netmaker_master_key="${NETMAKER_MASTER_KEY}" -vvv

# ============================================================================
# ADVANCED USAGE
# ============================================================================

# Run any playbook with custom variables
# Example: just run create_network.yml -e netmaker_master_key=XXX
# Example: just run manage_devices.yml --check -vvv
run playbook *args='':
    @echo "▶️  Running playbook: {{playbook}}"
    uv run ansible-playbook playbooks/{{playbook}} {{args}}

# ============================================================================
# DEVELOPMENT & MAINTENANCE
# ============================================================================

# Bump version in galaxy.yml and pyproject.toml
# Example: just bump-version 1.1.0
bump-version version:
    @./scripts/bump-version.sh {{version}}

# Syntax check all playbooks for errors
lint:
    @echo "🔍 Checking playbook syntax..."
    uv run ansible-playbook playbooks/create_network.yml --syntax-check
    uv run ansible-playbook playbooks/delete_network.yml --syntax-check
    uv run ansible-playbook playbooks/manage_devices.yml --syntax-check
    uv run ansible-playbook playbooks/delete_device.yml --syntax-check
    @echo "✓ All playbooks are valid"

# Clean Python cache files
clean:
    @echo "🧹 Cleaning Python cache files..."
    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find . -type f -name "*.pyc" -delete 2>/dev/null || true
    @echo "✓ Cache cleaned"

# ============================================================================
# QUICK REFERENCE
# ============================================================================

# Show quick reference guide
help:
    @echo "╔════════════════════════════════════════════════════════════════╗"
    @echo "║        Netmaker Ansible Module - Quick Reference              ║"
    @echo "╚════════════════════════════════════════════════════════════════╝"
    @echo ""
    @echo "📦 SETUP:"
    @echo "  just install          Install dependencies"
    @echo "  just check            Verify Ansible installation"
    @echo ""
    @echo "🌐 NETWORKS:"
    @echo "  just create           Create/update networks"
    @echo "  just delete NAME      Delete network by name"
    @echo "  just create-check     Dry run (preview changes)"
    @echo ""
    @echo "📱 DEVICES:"
    @echo "  just manage-devices   Create/update devices"
    @echo "  just delete-device NAME [NETWORK]"
    @echo "                        Delete device from network"
    @echo "  just devices-check    Dry run (preview changes)"
    @echo ""
    @echo "🔧 ADVANCED:"
    @echo "  just run PLAYBOOK [ARGS]"
    @echo "                        Run custom playbook"
    @echo "  just create-verbose   Verbose network creation"
    @echo "  just devices-verbose  Verbose device management"
    @echo ""
    @echo "🛠️  MAINTENANCE:"
    @echo "  just lint             Check playbook syntax"
    @echo "  just clean            Clean Python cache"
    @echo ""
    @echo "💡 EXAMPLES:"
    @echo "  just create"
    @echo "  just delete iot-network"
    @echo "  just manage-devices"
    @echo "  just delete-device sensor-01"
    @echo "  just delete-device camera-01 prod-network"
    @echo "  just run manage_devices.yml --check -vvv"
    @echo ""
    @echo "📚 For full documentation, see README.md"
