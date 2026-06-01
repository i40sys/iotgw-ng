# Cosmian KMS - Key Management System PoC

A comprehensive Proof of Concept demonstrating key management capabilities using [Cosmian KMS](https://cosmian.com/), including SSH key management, X.509 PKI certificate lifecycle, and automated testing infrastructure.

## Features

- **SSH Key Management** - Generate, store, export, and convert Ed25519/RSA keys
- **X.509 PKI** - Complete certificate lifecycle: CA creation, server/client certificates, PKCS#12 bundles
- **Docker-Based Deployment** - Containerized KMS with persistent SQLite storage
- **Automated Testing** - Isolated Docker environment for SSH authentication validation
- **Format Conversion** - Bidirectional PKCS8 ↔ OpenSSH key format conversion

## Architecture

```
kms/
├── pyproject.toml              # Python project (uv) with dependencies
├── .pre-commit-config.yaml     # Git hooks (ruff + commitizen)
├── docker-compose.yml          # Main KMS service orchestration
├── kms.toml                    # KMS server configuration
├── .env.example                # Environment variables template
├── VERSION                     # Project version
├── data/                       # Persistent KMS database
│   └── kms.db                  # SQLite database
│
├── src/kms_tools/              # Python utilities package
│   ├── __init__.py
│   └── convert_keys.py         # PKCS8 ↔ OpenSSH converter
│
├── contrib/                    # CLI binaries and tools
│   ├── README.md               # CLI documentation and upgrade guide
│   └── cosmian                 # Cosmian CLI (v1.9.0)
│
├── ssh-test/                   # SSH Key Management PoC
│   ├── README.md               # SSH workflow documentation
│   └── docker-test/            # Automated SSH testing
│       ├── README.md           # SSH test documentation
│       ├── docker-compose.yml  # SSH server/client services
│       ├── Dockerfile.sshd     # SSH server image
│       ├── Dockerfile.client   # SSH client image
│       ├── test-ssh-keys.sh    # Test orchestration script
│       └── keys/               # Generated SSH keys
│
└── pki-test/                   # X.509 Certificate PoC
    ├── README.md               # PKI workflow documentation
    ├── create_ca.sh            # CA creation script
    ├── ca.ext                  # CA certificate extensions
    ├── server.ext              # Server certificate extensions
    └── client.ext              # Client certificate extensions
```

## Documentation Index

| Document | Description |
|----------|-------------|
| [contrib/README.md](contrib/README.md) | CLI binaries, upgrade instructions, command reference |
| [ssh-test/README.md](ssh-test/README.md) | SSH key management workflow and examples |
| [ssh-test/docker-test/README.md](ssh-test/docker-test/README.md) | Automated SSH authentication testing |
| [pki-test/README.md](pki-test/README.md) | X.509 PKI certificate lifecycle guide |

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Python 3.10+ (for SSH key conversion tools)
- [uv](https://docs.astral.sh/uv/) (Python package manager)

## Quick Start

### 1. Setup Environment

```bash
cd kms
cp .env.example .env
# Edit .env if needed
```

### 2. Start the KMS Service

```bash
docker-compose up -d
```

### 3. Verify the Service

```bash
# Health check
curl http://localhost:9998/health

# View logs
docker-compose logs -f cosmian-kms

# Check server version via CLI
cosmian kms server-version
```

> **Note**: Add `contrib/` to your PATH or use `./contrib/cosmian` for CLI commands.

## Environment Configuration

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

### Key Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RUST_LOG` | Logging level (trace, debug, info, warn, error) | `info` |
| `KMS_DEFAULT_URL` | KMS server URL for CLI | `http://localhost:9998` |
| `KMS_PORT` | KMS server port | `9998` |

See [.env.example](.env.example) for all available options including authentication and TLS settings.

## CLI Usage

The Cosmian CLI is located in the `contrib/` directory. See [contrib/README.md](contrib/README.md) for upgrade instructions and detailed command reference.

### Setup

```bash
# Option 1: Add to PATH
export PATH="$PWD/contrib:$PATH"

# Option 2: Use full path
./contrib/cosmian kms <command>

# Option 3: Create alias
alias cosmian="$PWD/contrib/cosmian"
```

### Basic Commands

```bash
# Check CLI version
cosmian --version

# Check server version
cosmian kms server-version

# Create Ed25519 key pair
cosmian kms ec keys create -t ssh-key-ed25519 --curve ed25519

# Create RSA 4096-bit key pair
cosmian kms rsa keys create -t ssh-key-rsa --size_in_bits 4096

# List keys by tag
cosmian kms locate -t ssh-key
```

## SSH Key Management

Generate and manage SSH keys using KMS with full format conversion support. See [ssh-test/README.md](ssh-test/README.md) for complete documentation.

### Quick Example

```bash
# Generate Ed25519 key pair in KMS
cosmian kms ec keys create -t ssh-key-ed25519 --curve ed25519 my_ssh_key

# Export private key in PKCS8 format
cosmian kms ec keys export -t ssh-key-ed25519 -f pem ed25519_pkcs8.pem

# Convert to OpenSSH format (using uv)
uv run convert-keys pkcs8-to-ssh ed25519_pkcs8.pem ./ssh-test/docker-test/keys/id_ed25519
```

### Run SSH Tests

```bash
cd ssh-test/docker-test
./test-ssh-keys.sh test
```

See [ssh-test/docker-test/README.md](ssh-test/docker-test/README.md) for test details.

## X.509 Certificate Management

Full PKI workflow with CA, server, and client certificates. See [pki-test/README.md](pki-test/README.md) for complete documentation.

### Quick Example

```bash
cd pki-test

# Create Root CA
cosmian kms certificates certify \
  --certificate-id root_ca \
  --generate-key-pair \
  --algorithm rsa4096 \
  --subject-name "CN=YMB Root CA,O=YMB,C=ES" \
  --days 3650 \
  --certificate-extensions ca.ext \
  -t root-ca

# Issue Server Certificate
cosmian kms certificates certify \
  --certificate-id server_cert \
  --issuer-certificate-id root_ca \
  --generate-key-pair \
  --algorithm rsa2048 \
  --subject-name "CN=wsl.ymbihq.local,O=YMB,C=ES" \
  --days 365 \
  --certificate-extensions server.ext \
  -t server-cert

# Export as PKCS#12 bundle (use private key ID)
cosmian kms certificates export -c <private-key-id> -f pkcs12 -p "password" server.p12
```

## Configuration

### kms.toml

Main KMS server configuration:

```toml
[server]
hostname = "0.0.0.0"
port = 9998
database_type = "sqlite"
sqlite_path = "/cosmian-kms/sqlite-data/kms.db"
```

### Modify Configuration

```bash
# Edit configuration
vim kms.toml

# Restart service
docker-compose restart cosmian-kms
```

## Supported Algorithms

| Type | Algorithms |
|------|------------|
| **Asymmetric** | RSA (2048, 4096), Ed25519, ECDSA (P-256, P-384) |
| **Curves** | Ed25519, NIST P-256, NIST P-384 |
| **Formats** | PKCS8 PEM, OpenSSH, PKCS#12, X.509 PEM |

## Service Management

```bash
# Start service
docker-compose up -d

# Stop service
docker-compose down

# Stop and remove data
docker-compose down -v

# View logs
docker-compose logs -f cosmian-kms

# Restart service
docker-compose restart cosmian-kms
```

## Testing Infrastructure

The project includes Docker-based testing for SSH authentication. See [ssh-test/docker-test/README.md](ssh-test/docker-test/README.md) for details.

```bash
cd ssh-test/docker-test

# Run full test suite (generate keys, build containers, test SSH)
./test-ssh-keys.sh test

# Individual commands
./test-ssh-keys.sh generate  # Generate keys only
./test-ssh-keys.sh start     # Start test containers
./test-ssh-keys.sh stop      # Stop and cleanup
./test-ssh-keys.sh clean     # Full cleanup including images
```

### Test Scenarios

1. **Ed25519 Authentication** - SSH login using Ed25519 key
2. **RSA Authentication** - SSH login using RSA 4096 key
3. **Remote Command Execution** - Execute commands via SSH
4. **File Transfer** - SCP file operations
5. **Invalid Key Rejection** - Security validation

## Security Considerations

> **WARNING**: This configuration is designed for development and testing.

### For Production Deployment

1. **Enable Authentication** - Configure JWT/OIDC authentication
2. **Enable TLS** - Use valid SSL certificates
3. **Use Production Database** - Switch to PostgreSQL or MySQL
4. **Configure CORS** - Restrict cross-origin requests
5. **Network Security** - Implement firewall rules and network segmentation
6. **Key Protection** - Consider HSM integration for key storage
7. **Audit Logging** - Enable comprehensive logging
8. **Certificate Validity** - Use shorter certificate lifetimes
9. **Key Rotation** - Implement automatic key rotation policies

### Production Configuration Example

```toml
[server]
hostname = "0.0.0.0"
port = 9998

[server.tls]
certificate_file = "/path/to/cert.pem"
private_key_file = "/path/to/key.pem"

[server.auth]
jwt_issuer = "https://your-auth-provider.com"
```

## Troubleshooting

### Container Won't Start

```bash
# Check if port is in use
netstat -tuln | grep 9998

# Check logs
docker-compose logs cosmian-kms
```

### Permission Issues

```bash
# Fix data directory permissions
sudo chown -R $USER:$USER data/
chmod 755 data/
```

### Key Export Failures

```bash
# Verify key exists
cosmian kms locate -t <tag-name>

# Export with explicit key ID
cosmian kms ec keys export -k <exact-id> -f pem output.pem
```

### SSH Key Format Issues

```bash
# Verify key format
file keys/id_ed25519
ssh-keygen -l -f keys/id_ed25519

# Check Python dependencies
pip3 install cryptography
```

### CLI Connection Issues

```bash
# Verify KMS is running
curl http://localhost:9998/health

# Set URL explicitly
cosmian --kms-url http://localhost:9998 kms server-version

# Check environment variable
export KMS_DEFAULT_URL=http://localhost:9998
```

## Development

This project uses [uv](https://docs.astral.sh/uv/) for Python package management and [commitizen](https://commitizen-tools.github.io/commitizen/) for conventional commits.

### Setup

```bash
# Install dependencies
uv sync

# Install git hooks (ruff linting + commit message validation)
uv run pre-commit install --hook-type commit-msg --hook-type pre-commit
```

### Making Commits

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```bash
git add .
git commit -m "feat: add new feature"
git commit -m "fix: resolve bug in key export"
git commit -m "docs: update README"
```

### Version Bumping & Releases

```bash
# Bump version (auto-detects from commits)
uv run cz bump

# Or force specific increment
uv run cz bump --increment PATCH

# Push with tags
git push origin main --tags

# Create GitHub release
gh release create $(git describe --tags --abbrev=0) --generate-notes
```

## Version

Current version: **0.2.0**

| Component | Version |
|-----------|---------|
| Cosmian KMS Server | 5.9.0 (Docker) |
| Cosmian CLI | 1.9.0 |

## Upgrading CLI

See [contrib/README.md](contrib/README.md) for instructions on upgrading the Cosmian CLI to the latest version.

## External Documentation

- [Cosmian KMS Documentation](https://docs.cosmian.com/)
- [Cosmian CLI Documentation](https://docs.cosmian.com/cosmian_key_management_system/cli/cli/)
- [Cosmian GitHub - KMS](https://github.com/Cosmian/kms)
- [Cosmian GitHub - CLI](https://github.com/Cosmian/cli)
- [KMIP Standard](https://www.oasis-open.org/committees/kmip/)

## License

This PoC is provided for evaluation and development purposes.
