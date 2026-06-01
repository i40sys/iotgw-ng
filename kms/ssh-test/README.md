# SSH Key Management with Cosmian KMS

This guide demonstrates how to store and retrieve OpenSSH keys using Cosmian KMS.

## Overview

Cosmian KMS supports managing SSH keys by:
- Creating Ed25519 or RSA key pairs directly in the KMS
- Importing existing SSH keys into the KMS
- Exporting keys from KMS for SSH use

The KMS stores keys in KMIP format internally, but can export them in PKCS8 PEM format which can then be converted to OpenSSH format.

## Prerequisites

- Cosmian KMS running (via Docker Compose)
- Cosmian CLI (`cosmian`) - see [contrib/README.md](../contrib/README.md)
- [uv](https://docs.astral.sh/uv/) for running Python tools

```bash
# From the kms/ root directory, install dependencies
uv sync
```

## Quick Start

### 1. Start the KMS

```bash
cd ..  # Go to kms directory
docker compose up -d
```

Verify it's running:
```bash
curl http://localhost:9998/version
```

### 2. Environment Setup

```bash
# Add CLI to PATH (from kms directory)
export PATH="$PWD/contrib:$PATH"

# Or set KMS URL
export KMS_DEFAULT_URL="http://localhost:9998"
```

## Creating SSH Keys in KMS

### Create Ed25519 Key (Recommended for SSH)

```bash
cosmian kms ec keys create --curve ed25519 -t ssh-key -t ed25519 my_ssh_key
```

Output:
```
The EC key pair has been created.
    Public key unique identifier: my_ssh_key_pk
    Private key unique identifier: my_ssh_key
```

### Create RSA Key (4096 bits)

```bash
cosmian kms rsa keys create --size_in_bits 4096 -t ssh-key -t rsa my_ssh_key_rsa
```

## Exporting Keys from KMS

### Export as PKCS8 PEM

```bash
# Export private key
cosmian kms ec keys export -k my_ssh_key -f pem private_key.pem

# For RSA keys
cosmian kms rsa keys export -k my_ssh_key_rsa -f pem rsa_private_key.pem
```

### Convert to OpenSSH Format

Use the `convert-keys` CLI tool (from the project root):

```bash
# From kms/ root directory
uv run convert-keys pkcs8-to-ssh private_key.pem id_ed25519
```

This creates:
- `id_ed25519` - OpenSSH private key
- `id_ed25519.pub` - OpenSSH public key

Or using Python directly:

```python
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

# Read the PKCS8 PEM private key
with open('private_key.pem', 'rb') as f:
    private_key = serialization.load_pem_private_key(f.read(), password=None, backend=default_backend())

# Convert to OpenSSH format
openssh_private = private_key.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.OpenSSH,
    encryption_algorithm=serialization.NoEncryption()
)

# Get the public key in OpenSSH format
public_key = private_key.public_key()
openssh_public = public_key.public_bytes(
    encoding=serialization.Encoding.OpenSSH,
    format=serialization.PublicFormat.OpenSSH
)

# Write the files
with open('id_ed25519', 'wb') as f:
    f.write(openssh_private)

with open('id_ed25519.pub', 'wb') as f:
    f.write(openssh_public + b' my-key-comment\n')
```

### Verify the Key

```bash
chmod 600 id_ed25519
ssh-keygen -lf id_ed25519.pub
```

Expected output:
```
256 SHA256:XXXX... my-key-comment (ED25519)
```

## Importing Existing SSH Keys into KMS

### Step 1: Convert OpenSSH Key to PKCS8 PEM

```bash
# From kms/ root directory
uv run convert-keys ssh-to-pkcs8 id_ed25519 private_key_pkcs8.pem
```

Or using Python:

```python
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

# Read the OpenSSH private key
with open('id_ed25519', 'rb') as f:
    private_key = serialization.load_ssh_private_key(f.read(), password=None, backend=default_backend())

# Convert to PKCS8 PEM format
pkcs8_private = private_key.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption()
)

with open('private_key_pkcs8.pem', 'wb') as f:
    f.write(pkcs8_private)
```

### Step 2: Import into KMS

```bash
cosmian kms ec keys import --key-format pem -t ssh-imported -t ed25519 private_key_pkcs8.pem imported_ssh_key
```

## Managing Keys in KMS

### List All SSH Keys

```bash
cosmian kms locate -t ssh-key
```

### Get Key Attributes

```bash
cosmian kms attributes get --id my_ssh_key
```

### Revoke a Key

```bash
cosmian kms ec keys revoke -k my_ssh_key "KeyCompromise"
```

Revocation reasons: `Superseded`, `KeyCompromise`, `CACompromise`, `AffiliationChanged`, `Cessation`, `PrivilegeWithdrawn`

### Destroy a Key (requires revocation first)

```bash
cosmian kms ec keys destroy -k my_ssh_key
```

## File Structure

```
kms/
├── src/kms_tools/
│   └── convert_keys.py          # Key conversion utility (CLI: uv run convert-keys)
│
└── ssh-test/
    ├── README.md                    # This documentation
    ├── docker-test/                 # Automated SSH testing
    │   └── keys/                    # Generated SSH keys
    ├── id_ed25519_kms               # Ed25519 private key (OpenSSH format)
    ├── id_ed25519_kms.pub           # Ed25519 public key (OpenSSH format)
    ├── id_rsa_kms                   # RSA private key (OpenSSH format)
    ├── id_rsa_kms.pub               # RSA public key (OpenSSH format)
    ├── private_key.pem              # Ed25519 private key (PKCS8 PEM)
    └── public_key.pem               # Ed25519 public key (PKCS8 PEM)
```

## Supported Key Types

| Type | Algorithm | KMS Command | SSH Compatible |
|------|-----------|-------------|----------------|
| Ed25519 | EdDSA | `cosmian kms ec keys --curve ed25519` | Yes |
| RSA | RSA 2048/4096 | `cosmian kms rsa keys --size_in_bits` | Yes |
| ECDSA P-256 | NIST P-256 | `cosmian kms ec keys --curve nist-p256` | Yes |
| ECDSA P-384 | NIST P-384 | `cosmian kms ec keys --curve nist-p384` | Yes |

## Complete Workflow Example

### Create, Export, Use SSH Key

```bash
# 1. Create key in KMS
cosmian kms ec keys create --curve ed25519 -t production -t server-access server_ssh_key

# 2. Export from KMS
cosmian kms ec keys export -k server_ssh_key -f pem server_key.pem

# 3. Convert to OpenSSH (from kms/ root directory)
uv run convert-keys pkcs8-to-ssh server_key.pem ~/.ssh/id_ed25519_server

# 4. Use with SSH
ssh -i ~/.ssh/id_ed25519_server user@server.example.com

# 5. Add public key to authorized_keys on server
cat ~/.ssh/id_ed25519_server.pub >> ~/.ssh/authorized_keys
```

### Import Existing Key for Backup

```bash
# 1. Convert existing SSH key (from kms/ root directory)
uv run convert-keys ssh-to-pkcs8 ~/.ssh/id_ed25519 backup_key.pem

# 2. Import into KMS
cosmian kms ec keys import --key-format pem -t backup -t critical backup_key.pem my_backup_key

# 3. Clean up local file
rm backup_key.pem

# 4. Later, retrieve from KMS
cosmian kms ec keys export -k my_backup_key -f pem retrieved_key.pem
uv run convert-keys pkcs8-to-ssh retrieved_key.pem ~/.ssh/id_ed25519_restored
```

## Security Considerations

### For Development/Testing
- Keys stored in SQLite database on local disk
- No authentication required
- Suitable for PoC and development

### For Production
- Enable JWT authentication
- Use TLS for KMS API
- Consider HSM integration
- Use PostgreSQL/MySQL instead of SQLite
- Enable key wrapping with a master KEK
- Implement key rotation policies
- Consider using `--sensitive` flag to prevent key export

### Key Protection

To create non-exportable keys (stored only in KMS):

```bash
cosmian kms ec keys create --curve ed25519 --sensitive -t protected protected_key
```

## Troubleshooting

### "Load key: invalid format" with ssh-keygen

OpenSSH requires specific key formats. Use the `convert_keys.py` script to properly convert between PKCS8 and OpenSSH formats.

### Key import fails

Ensure the key is in PKCS8 PEM format. Use the conversion script if importing from OpenSSH format.

### Permission denied on private key

```bash
chmod 600 id_ed25519
```

### Key not found in KMS

Check if the key exists:
```bash
cosmian kms locate
```

List by tag:
```bash
cosmian kms locate -t ssh-key
```

## Proof of Concept Results

This PoC successfully demonstrated:

1. **Creating SSH keys in KMS**
   - Ed25519: `ssh_key_ed25519` (fingerprint verified)
   - RSA 4096: `ssh_key_rsa` (fingerprint verified)

2. **Exporting keys for SSH use**
   - PKCS8 PEM export works correctly
   - Python conversion to OpenSSH format successful
   - Keys are functional for SSH authentication

3. **Importing existing SSH keys**
   - Converted local key to PKCS8 format
   - Imported as `ssh_key_imported`
   - Re-exported and verified fingerprint matches original

4. **Key integrity verification**
   - Original key fingerprint: `SHA256:0DkEd5fy9ipEzhJICeZwN+ftOexWhKEHDfGMnIB8ZMI`
   - Retrieved key fingerprint: `SHA256:0DkEd5fy9ipEzhJICeZwN+ftOexWhKEHDfGMnIB8ZMI`
   - Perfect match confirms lossless storage and retrieval

## References

- [Cosmian KMS Documentation](https://docs.cosmian.com/)
- [Cosmian CLI GitHub](https://github.com/Cosmian/cli)
- [KMIP Specification](https://www.oasis-open.org/committees/tc_home.php?wg_abbrev=kmip)
- [OpenSSH Key Formats](https://www.openssh.com/)
- [Python Cryptography Library](https://cryptography.io/)

---

**Author**: Claude Code + Oriol
**Date**: 2026-02-24
**KMS Version**: 5.9.0
**CLI Version**: 1.9.0
