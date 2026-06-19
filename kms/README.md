# Cosmian KMS - Key Management System PoC

A comprehensive Proof of Concept demonstrating key management capabilities using [Cosmian KMS](https://cosmian.com/), including SSH key management, X.509 PKI certificate lifecycle, and automated testing infrastructure.

## Features

- **SSH Key Management** - Generate, store, export, and convert Ed25519/RSA keys
- **X.509 PKI** - Complete certificate lifecycle: CA creation, server/client certificates, PKCS#12 bundles
- **Kubernetes Deployment** - The KMS runs on the kind cluster (`deploy/k8s/base/kms/`) with persistent SQLite storage on a PVC; docker-compose was decommissioned (`decision-017`)
- **Format Conversion** - Bidirectional PKCS8 ↔ OpenSSH key format conversion

## Architecture

```
kms/
├── pyproject.toml              # Python project (uv) with dependencies
├── .pre-commit-config.yaml     # Git hooks (ruff + commitizen)
├── kms.toml                    # KMS server configuration (mounted via the k8s ConfigMap)
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
| [pki-test/README.md](pki-test/README.md) | X.509 PKI certificate lifecycle guide |

## Prerequisites

- A running kind cluster with the platform deployed (`just bootstrap` from the repo root) — the KMS runs on it
- Docker + kubectl + kind (for the cluster)
- Python 3.10+ (for SSH key conversion tools)
- [uv](https://docs.astral.sh/uv/) (Python package manager)

## Quick Start

### 1. Bring the KMS up on the cluster

The KMS is deployed as part of the platform (it is not a standalone compose stack
anymore — `decision-017`):

```bash
# from the repo root
just bootstrap                                       # kind-up + k8s-deploy + k8s-smoke
kubectl -n iotgw rollout status deploy/cosmian-kms   # KMS Ready?
```

### 2. Verify the Service

```bash
# Health check / logs / version
kubectl -n iotgw logs -f deploy/cosmian-kms
cosmian kms server-version
```

> **Auth + NetworkPolicy (task-057):** on the cluster the KMS requires an
> API-token bearer and a NetworkPolicy restricts `:9998` to in-namespace clients,
> so the host `:9998` NodePort is blocked — the KMS is reached in-cluster (see the
> security note in [CLAUDE.md](CLAUDE.md)). CLI calls below assume an in-cluster /
> port-forwarded path with the token presented as `Authorization: Bearer <token>`.

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

Generate and manage SSH keys using the KMS with full format conversion support.
In the platform, the iotgw-ui backend mints per-device SSH keys directly in the
KMS (decision-010 / task-060); the CLI flow below is for manual/local use.

### Quick Example

```bash
# Generate Ed25519 key pair in KMS
cosmian kms ec keys create -t ssh-key-ed25519 --curve ed25519 my_ssh_key

# Export private key in PKCS8 format
cosmian kms ec keys export -t ssh-key-ed25519 -f pem ed25519_pkcs8.pem

# Convert to OpenSSH format (using uv)
uv run convert-keys pkcs8-to-ssh ed25519_pkcs8.pem ./id_ed25519
```

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

`kms.toml` is delivered to the pod via the k8s ConfigMap (`deploy/k8s/base/kms/`):

```bash
# Edit configuration
vim kms.toml

# Re-apply the manifests and roll the deployment so the pod picks up the change
kubectl apply -k deploy/k8s/overlays/kind
kubectl -n iotgw rollout restart deploy/cosmian-kms
```

## Supported Algorithms

| Type | Algorithms |
|------|------------|
| **Asymmetric** | RSA (2048, 4096), Ed25519, ECDSA (P-256, P-384) |
| **Curves** | Ed25519, NIST P-256, NIST P-384 |
| **Formats** | PKCS8 PEM, OpenSSH, PKCS#12, X.509 PEM |

## Service Management

The KMS is managed as a k8s workload on the kind cluster (use the **k8s-operator**
agent for cluster ops):

```bash
# Bring the platform (incl. KMS) up / tear it down
just bootstrap                                       # up
just kind-down                                       # tear the whole cluster down

# Status / logs / restart
kubectl -n iotgw get pods -l app=cosmian-kms
kubectl -n iotgw logs -f deploy/cosmian-kms
kubectl -n iotgw rollout restart deploy/cosmian-kms
```

> The KMS SQLite data lives on a PVC; deleting the cluster (`just kind-down`)
> discards it (kind storage is throwaway).

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

### Pod Won't Start

```bash
# Inspect scheduling / image-pull / mount events
kubectl -n iotgw describe pod -l app=cosmian-kms

# Check logs
kubectl -n iotgw logs deploy/cosmian-kms
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
| Cosmian KMS Server | 5.20.0 (`ghcr.io/cosmian/kms:5.20.0`, on kind) |
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
