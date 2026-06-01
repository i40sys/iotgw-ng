#!/usr/bin/env python3
"""
SSH Key Conversion Utility for Cosmian KMS

This script converts between PKCS8 PEM format (used by KMS) and OpenSSH format.

Usage:
    # Convert PKCS8 PEM to OpenSSH
    ./convert_keys.py pkcs8-to-ssh private_key.pem id_ed25519

    # Convert OpenSSH to PKCS8 PEM (for KMS import)
    ./convert_keys.py ssh-to-pkcs8 id_ed25519 private_key.pem

Requirements:
    pip install cryptography
"""

import os
import sys

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization


def pkcs8_to_openssh(input_file: str, output_basename: str):
    """Convert PKCS8 PEM private key to OpenSSH format."""
    with open(input_file, "rb") as f:
        private_key = serialization.load_pem_private_key(
            f.read(), password=None, backend=default_backend()
        )

    # Convert to OpenSSH format
    openssh_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=serialization.NoEncryption(),
    )

    # Get the public key in OpenSSH format
    public_key = private_key.public_key()
    openssh_public = public_key.public_bytes(
        encoding=serialization.Encoding.OpenSSH, format=serialization.PublicFormat.OpenSSH
    )

    # Write the files
    private_key_path = output_basename
    public_key_path = f"{output_basename}.pub"

    with open(private_key_path, "wb") as f:
        f.write(openssh_private)
    os.chmod(private_key_path, 0o600)

    with open(public_key_path, "wb") as f:
        f.write(openssh_public + b" kms-key\n")

    print(f"OpenSSH Private Key saved: {private_key_path}")
    print(f"OpenSSH Public Key saved: {public_key_path}")


def openssh_to_pkcs8(input_file: str, output_file: str):
    """Convert OpenSSH private key to PKCS8 PEM format for KMS import."""
    with open(input_file, "rb") as f:
        content = f.read()

    # Try OpenSSH format first, then PEM
    try:
        private_key = serialization.load_ssh_private_key(
            content, password=None, backend=default_backend()
        )
    except ValueError:
        private_key = serialization.load_pem_private_key(
            content, password=None, backend=default_backend()
        )

    # Convert to PKCS8 PEM format
    pkcs8_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

    with open(output_file, "wb") as f:
        f.write(pkcs8_private)

    print(f"PKCS8 PEM Key saved: {output_file}")


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]
    input_file = sys.argv[2]
    output_file = sys.argv[3]

    if command == "pkcs8-to-ssh":
        pkcs8_to_openssh(input_file, output_file)
    elif command == "ssh-to-pkcs8":
        openssh_to_pkcs8(input_file, output_file)
    else:
        print(f"Unknown command: {command}")
        print("Use: pkcs8-to-ssh or ssh-to-pkcs8")
        sys.exit(1)


if __name__ == "__main__":
    main()
