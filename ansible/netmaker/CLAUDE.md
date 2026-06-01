# CLAUDE.md - AI Assistant Guide

## Project Overview

**Project Name:** Netmaker Ansible Collection
**Type:** Ansible Collection for Infrastructure Automation
**Purpose:** Comprehensive Ansible automation for managing Netmaker WireGuard mesh networks and external client devices via the Netmaker API
**Current Version:** 1.0.3 (released 2025-10-16)

## What This Project Does

This is an Ansible collection that provides infrastructure-as-code management for Netmaker, a WireGuard-based mesh networking platform. It enables automated provisioning and configuration of:

1. **Virtual Networks**: WireGuard mesh networks with customizable IP ranges, MTU, DNS, and other networking parameters
2. **External Client Devices**: WireGuard configuration files for IoT devices, phones, laptops, and other devices that connect without the netclient software

The collection provides a unified, idempotent Ansible module (`netmaker_management`) that handles complete CRUD lifecycle operations for both resource types.

## Architecture & Key Components

### Project Structure

```
ansible/netmaker/
├── plugins/modules/
│   └── netmaker_management.py    # Main Ansible module (693 lines)
├── playbooks/                     # Working playbooks
│   ├── create_network.yml
│   ├── delete_network.yml
│   ├── manage_devices.yml
│   └── delete_device.yml
├── docs/                          # Module documentation
│   └── netmaker_management_module.md
├── meta/
│   └── runtime.yml               # Ansible version requirements
├── library/                      # Empty (legacy location)
├── roles/                        # Empty (future expansion)
├── scripts/
│   └── bump-version.sh          # Version management helper
├── README.md                     # Comprehensive documentation (includes all usage examples)
├── galaxy.yml                    # Ansible Galaxy metadata
├── pyproject.toml               # Python dependencies (UV)
├── justfile                     # Task runner commands
└── ansible.cfg                  # Ansible configuration
```

### Core Module: `netmaker_management`

Located at: `plugins/modules/netmaker_management.py`

**Capabilities:**
- Manages two resource types: `network` and `extclient`
- Supports both master key and username/password authentication
- Fully idempotent operations (safe to run multiple times)
- Check mode support (dry-run capability)
- Auto-discovery of ingress gateways for external clients
- SSL certificate validation control

**API Integration:**
- Uses the Netmaker REST API via the `requests` library
- Handles authentication, error handling, and response parsing
- Implements resource comparison logic for idempotency

## File Structure Analysis

### 📁 Docs Directory

**Status:** ✅ NEEDED and CURRENT

**Contents:**
- `netmaker_management_module.md` - Module reference documentation

**Analysis:**
The docs directory provides standalone module documentation:
- **Necessary**: Yes - Provides focused module documentation separate from the main README
- **Up-to-date**: Yes - Accurately documents the module's parameters and usage
- **Lightweight**: Appropriately brief, referring to README.md for detailed documentation

**Current Content:**
- Synopsis and overview
- Requirements
- Basic code examples (create network, create device, delete device)
- Return values
- Author information

**Recommendation:** Keep as-is. This is a standard best practice for Ansible collections. The module also contains comprehensive EXAMPLES section in its DOCUMENTATION. Consider adding to docs:
- More complex code snippets (updating resources, using loops, handling errors)
- Troubleshooting section
- API compatibility notes

### 📁 Library Directory

**Status:** ⚠️ EMPTY - Can be REMOVED or KEPT

**Analysis:**
The library directory is empty. In Ansible collections:
- `library/` was the legacy location for modules
- `plugins/modules/` is the modern standard location
- The actual module is correctly placed in `plugins/modules/`

**Current Build Configuration:**
In `galaxy.yml`, the `build_ignore` explicitly excludes the `library` folder from the collection tarball, so it's not shipped to users.

**Recommendation:**
- **Option 1 (Clean):** Remove the directory entirely - it's not being used
- **Option 2 (Safe):** Keep it empty - it's already excluded from builds and doesn't harm anything

## Technology Stack

**Runtime:**
- Python >= 3.8
- Ansible >= 2.9.10
- Python `requests` library >= 2.25.0

**Development Tools:**
- UV (modern Python package manager)
- Just (command runner / task automation)
- ansible-lint (optional dev dependency)
- yamllint (optional dev dependency)
- Black code formatter

**API Integration:**
- Netmaker REST API
- Bearer token authentication
- JSON request/response format

## Key Features

1. **Unified Interface**: Single module for both networks and devices
2. **Idempotent Operations**: Safe to run repeatedly, only changes what's needed
3. **Auto-Discovery**: Automatically finds ingress gateways when using `ingress_gateway_id: auto`
4. **Flexible Authentication**: Supports both master key and username/password
5. **Check Mode**: Preview changes before applying (`--check` flag)
6. **Modern Tooling**: Uses UV for dependency management and Just for task running
7. **Production Ready**: Published to Ansible Galaxy as `oriolrius.netmaker`

## Development Workflow

### Setup
```bash
just install          # Install dependencies
just check            # Verify Ansible installation
```

### Network Operations
```bash
just create           # Create/update networks
just delete my-net    # Delete specific network
just create-check     # Dry run
```

### Device Operations
```bash
just manage-devices   # Create/update devices
just delete-device sensor-01
just devices-check    # Dry run
```

### Maintenance
```bash
just lint             # Syntax check playbooks
just clean            # Clean Python cache
just bump-version 1.1.0  # Update version numbers
```

## Authentication

The project uses master key authentication loaded from `.env` file:

```bash
NETMAKER_ENDPOINT=https://api.netmaker.example.com
NETMAKER_MASTER_KEY=your_actual_master_key_here
```

The justfile automatically loads and passes the master key to all playbook executions.

## CI/CD Integration

**GitHub Actions:**
- Workflow: `.github/workflows/publish-collection.yml`
- Triggers: On push to main branch
- Actions:
  1. Verifies version consistency between `galaxy.yml` and `pyproject.toml`
  2. Builds the collection tarball
  3. Publishes to Ansible Galaxy
  4. Creates GitHub Release with the tarball

**Version Management:**
- Both `galaxy.yml` and `pyproject.toml` must have matching versions
- Use `just bump-version X.Y.Z` to update both files
- GitHub Actions enforces version synchronization

## Important Notes for AI Assistants

### Module Location
- The actual module is at `plugins/modules/netmaker_management.py`
- The `library/` directory is empty and ignored during builds

### Namespace Usage
- **In collection (playbooks/)**: Use `netmaker_management` (short name) due to ansible.cfg configuration
- **For Galaxy users**: Must use `oriolrius.netmaker.netmaker_management` (FQCN)
- **In documentation**: Always show FQCN for clarity

### Configuration Files
- `.env` file contains secrets and is git-ignored
- `.env.example` provides the template
- `ansible.cfg` configures module search paths for local development

### Build Artifacts
The following are excluded from the collection tarball (see `galaxy.yml`):
- `.git`, `.gitignore`
- `.env`, `.env.example`
- Python cache files (`__pycache__`, `*.pyc`, `*.pyo`)
- Virtual environments (`.venv`, `venv`)
- `library/` directory (empty, legacy)
- `playbooks/` directory (development only)
- `justfile`, `uv.lock`, `pyproject.toml`

### What Gets Published to Ansible Galaxy
When users install `oriolrius.netmaker`, they receive:
- `plugins/modules/netmaker_management.py` (the module with embedded EXAMPLES)
- `docs/` (documentation)
- `meta/runtime.yml` (Ansible requirements)
- `README.md` (comprehensive documentation with usage examples)
- `galaxy.yml` (collection metadata)

## Common Development Tasks

### Adding New Module Features
1. Edit `plugins/modules/netmaker_management.py`
2. Update the DOCUMENTATION section in the module
3. Add code examples to EXAMPLES section in the module
4. Test with `just create-check` or `just devices-check`
5. Update `README.md` with new parameters and usage examples
6. Update `docs/netmaker_management_module.md` if needed

### Releasing a New Version
1. Make changes to code
2. Run `just bump-version X.Y.Z` to update versions
   - **Note**: The `bump-version.sh` script is **interactive**
   - It shows current versions and asks for confirmation (y/n)
   - Only proceeds if you answer 'y'
   - Updates both `galaxy.yml` and `pyproject.toml` atomically
   - Validates semantic versioning format (X.Y.Z)
3. Update CHANGELOG or release notes in README
4. Commit and push to main branch
5. GitHub Actions automatically publishes to Galaxy

**bump-version.sh Details:**
The script at `scripts/bump-version.sh` is interactive and requires user confirmation:
```bash
# Shows current versions
Current versions:
  galaxy.yml: 1.0.2
  pyproject.toml: 1.0.2

New version: 1.0.3

Update both files to version 1.0.3? (y/n)
```
- Validates version format (must be X.Y.Z)
- Requires confirmation before making changes
- Updates both files or neither (atomic operation)
- Provides next steps after successful update

### Testing Changes
```bash
# Syntax check
just lint

# Dry run (no changes made)
just create-check
just devices-check

# Verbose output for debugging
just create-verbose
just devices-verbose

# Run specific playbook
just run create_network.yml --check -vvv
```

## Known Issues & Edge Cases

1. **Ingress Gateway Discovery**: Requires at least one node in the network configured as an ingress gateway
2. **Authentication**: Either `master_key` or `password` must be provided (enforced by module)
3. **Network Dependencies**: External clients require the network to exist first
4. **SSL Certificates**: Can be disabled with `validate_certs: false` (not recommended for production)
5. **API Compatibility**: Designed for Netmaker API v0.x (check compatibility with newer versions)

## Future Expansion

- **roles/** directory is empty but available for Ansible roles
- Potential for additional modules (host management, ACLs, etc.)
- Integration with Ansible Tower/AWX
- Support for additional authentication methods (JWT, OAuth)

## Resources

- **GitHub**: https://github.com/oriolrius/netmaker-ansible-automation
- **Ansible Galaxy**: https://galaxy.ansible.com/ui/repo/published/oriolrius/netmaker/
- **Netmaker Docs**: https://docs.netmaker.io/
- **Netmaker API**: https://docs.netmaker.io/api.html

## Quick Reference for Claude

**When asked about structure:**
- The module is in `plugins/modules/`, not `library/`
- Docs directory contains module documentation for end users
- Playbooks directory contains working playbooks for development (not shipped to Galaxy)
- All usage examples are in README.md and in the module's EXAMPLES section

**When asked about updating:**
- Always update version in both `galaxy.yml` AND `pyproject.toml`
- Playbooks use short name `netmaker_management` (due to ansible.cfg)
- Galaxy users must use FQCN: `oriolrius.netmaker.netmaker_management`
- Update README.md when adding features (it contains comprehensive usage examples)

**When asked about files to ignore:**
- `.env` contains secrets
- `library/` is empty and excluded from builds
- `playbooks/` is not shipped to Galaxy users
- `.venv/` and `__pycache__/` are git-ignored

---

*Last Updated: 2025-10-16*
*Collection Version: 1.0.3*
*Author: Oriol Rius*
