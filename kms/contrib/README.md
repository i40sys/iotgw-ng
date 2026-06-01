# Cosmian CLI

This directory contains the Cosmian command-line interface binary for interacting with Cosmian KMS.

## Current Version

| Binary | Version | Description |
|--------|---------|-------------|
| `cosmian` | 1.9.0 | Unified CLI for KMS and Findex |

## Usage

The `cosmian` CLI uses a unified command structure:

```bash
# Add to PATH (from kms directory)
export PATH="$PWD/contrib:$PATH"

# Or use directly
./contrib/cosmian kms <command>
```

### Examples

```bash
# KMS commands
cosmian kms ec keys create -t my-key --curve ed25519
cosmian kms rsa keys create -t rsa-key --size_in_bits 4096
cosmian kms certificates certify --help
cosmian kms locate -t my-key
```

## Configuration

The CLI can be configured via:

1. **Environment variable** `KMS_DEFAULT_URL`
2. **Configuration file** at `~/.cosmian/cosmian.toml`
3. **Command-line flags** `--kms-url`, `--conf-path`, etc.

### Quick Configuration

```bash
# Set KMS URL via environment
export KMS_DEFAULT_URL=http://localhost:9998

# Or use command-line flag
cosmian --kms-url http://localhost:9998 kms server-version
```

### Configuration File

Create `~/.cosmian/cosmian.toml`:

```toml
[kms]
url = "http://localhost:9998"
# Optional: authentication
# access_token = "your-jwt-token"
```

## Upgrading to Latest Version

### Check Current Version

```bash
cosmian --version
```

### Check Latest Release

```bash
curl -s https://api.github.com/repos/Cosmian/cli/releases/latest | grep tag_name
```

### Download Latest Version

#### Linux (Ubuntu/Debian x86_64)

```bash
# Get latest version number
LATEST=$(curl -s https://api.github.com/repos/Cosmian/cli/releases/latest | grep tag_name | cut -d'"' -f4)
echo "Latest version: $LATEST"

# Download
wget -q "https://github.com/Cosmian/cli/releases/download/${LATEST}/ubuntu_22_04-release.zip" -O /tmp/cli-release.zip

# Extract
cd /tmp && unzip -o cli-release.zip
mv ubuntu_22_04-release/home/runner/work/cli/cli/target/x86_64-unknown-linux-gnu/release/cosmian /path/to/kms/contrib/
chmod +x /path/to/kms/contrib/cosmian

# Cleanup
rm -rf /tmp/ubuntu_22_04-release /tmp/cli-release.zip

# Verify
cosmian --version
```

#### Linux (Debian Package)

```bash
LATEST=$(curl -s https://api.github.com/repos/Cosmian/cli/releases/latest | grep tag_name | cut -d'"' -f4)
wget "https://github.com/Cosmian/cli/releases/download/${LATEST}/cosmian-cli_${LATEST}-1_amd64.deb"
sudo dpkg -i cosmian-cli_${LATEST}-1_amd64.deb
```

#### macOS (Apple Silicon)

```bash
LATEST=$(curl -s https://api.github.com/repos/Cosmian/cli/releases/latest | grep tag_name | cut -d'"' -f4)
wget "https://github.com/Cosmian/cli/releases/download/${LATEST}/macos_arm-release.zip"
unzip macos_arm-release.zip
# Binary is in the extracted directory
```

#### Windows

Download from:
```
https://github.com/Cosmian/cli/releases/latest
```
Look for `windows-release.zip`.

### Update Script

```bash
#!/bin/bash
# update-cosmian-cli.sh - Update Cosmian CLI to latest version

set -e
CONTRIB_DIR="$(dirname "$0")"
LATEST=$(curl -s https://api.github.com/repos/Cosmian/cli/releases/latest | grep tag_name | cut -d'"' -f4)

echo "Current version: $($CONTRIB_DIR/cosmian --version 2>/dev/null || echo 'not installed')"
echo "Latest version: $LATEST"

read -p "Update to $LATEST? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    wget -q "https://github.com/Cosmian/cli/releases/download/${LATEST}/ubuntu_22_04-release.zip" -O /tmp/cli-release.zip
    cd /tmp && unzip -o cli-release.zip
    mv ubuntu_22_04-release/home/runner/work/cli/cli/target/x86_64-unknown-linux-gnu/release/cosmian "$CONTRIB_DIR/"
    chmod +x "$CONTRIB_DIR/cosmian"
    rm -rf /tmp/ubuntu_22_04-release /tmp/cli-release.zip
    echo "Updated to: $($CONTRIB_DIR/cosmian --version)"
fi
```

## Available Platforms

| Platform | Architecture | Download |
|----------|--------------|----------|
| Ubuntu 22.04 | x86_64 | `ubuntu_22_04-release.zip` |
| Ubuntu 24.04 | x86_64 | `ubuntu_24_04-release.zip` |
| Rocky Linux 8 | x86_64 | `rockylinux8-release.zip` |
| Rocky Linux 9 | x86_64 | `rockylinux9-release.zip` |
| Debian 10 | x86_64 | `debian10-release.zip` |
| macOS | ARM64 | `macos_arm-release.zip` |
| Windows | x86_64 | `windows-release.zip` |

## CLI Command Reference

### Key Management

```bash
# Create keys
cosmian kms ec keys create -t <tag> --curve ed25519
cosmian kms rsa keys create -t <tag> --size_in_bits 4096

# List keys
cosmian kms locate -t <tag>

# Export keys
cosmian kms ec keys export -t <tag> -f pem output.pem

# Revoke/Destroy
cosmian kms ec keys revoke -k <key-id> "key_compromise"
cosmian kms ec keys destroy -k <key-id>
```

### Certificate Management

```bash
# Create CA
cosmian kms certificates certify \
  --certificate-id root_ca \
  --generate-key-pair \
  --algorithm rsa4096 \
  --subject-name "CN=Root CA,O=Org,C=US" \
  --days 3650 \
  --certificate-extensions ca.ext \
  -t root-ca

# Issue certificate
cosmian kms certificates certify \
  --certificate-id server_cert \
  --issuer-certificate-id root_ca \
  --generate-key-pair \
  --algorithm rsa2048 \
  --subject-name "CN=server.example.com,O=Org,C=US" \
  --days 365 \
  --certificate-extensions server.ext \
  -t server-cert

# Export
cosmian kms certificates export -c <cert-id> -f pem cert.pem
cosmian kms certificates export -c <private-key-id> -f pkcs12 -p "password" bundle.p12
```

### Server Operations

```bash
# Check server version
cosmian kms server-version

# Query server capabilities
cosmian kms query

# Discover KMIP versions
cosmian kms discover-versions
```

## Documentation

- [Cosmian CLI Documentation](https://docs.cosmian.com/cosmian_key_management_system/cli/cli/)
- [Cosmian CLI GitHub](https://github.com/Cosmian/cli)
- [Cosmian KMS GitHub](https://github.com/Cosmian/kms)
- [Release Downloads](https://github.com/Cosmian/cli/releases)
