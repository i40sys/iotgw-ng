# Testing PKI Creation Guide with Cosmian KMS

This document describes the complete process to create a testing PKI infrastructure using Cosmian KMS, including root CA certificate, server certificate, and client certificate.

## Environment Summary

- **KMS Server**: Cosmian KMS 5.9.0 running at `http://localhost:9998`
- **CLI Tool**: Cosmian CLI 1.9.0
- **Testing Domain**: `wsl.ymbihq.local`
- **Algorithm**: RSA 4096 bits for CA, RSA 2048 bits for end-entity certificates
- **Validity**: 10 years for CA, 1 year for end-entity certificates

## Generated Files

```
pki-test/
├── ca.ext              # X.509 extensions for CA certificate
├── server.ext          # X.509 extensions for server certificate
├── client.ext          # X.509 extensions for client certificate
├── root_ca.pem         # CA certificate in PEM format
├── server_cert.pem     # Server certificate in PEM format
├── client_cert.pem     # Client certificate in PEM format
├── server.p12          # Server certificate and key in PKCS#12 format
├── client.p12          # Client certificate and key in PKCS#12 format
└── README.md           # This documentation
```

## Step-by-Step Process

### Step 1: Start the Cosmian KMS Service

```bash
cd ..  # Go to kms directory
docker compose up -d
```

Verify the service is running:

```bash
curl http://localhost:9998/version
# Output: "5.9.0 (OpenSSL 3.2.0 23 Nov 2023)"
```

### Step 2: Setup CLI

Add the CLI to your PATH (from kms directory):

```bash
export PATH="$PWD/contrib:$PATH"

# Or set the KMS URL
export KMS_DEFAULT_URL="http://localhost:9998"
```

Verify the installation:

```bash
cosmian --version
# Output: cosmian_cli 1.9.0
```

### Step 3: Create X.509 Extensions

#### Extensions for Root CA (ca.ext)

```ini
[ v3_ca ]
basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign
subjectKeyIdentifier=hash
```

**Important Note**: Cosmian KMS does not support `cRLSign` or `authorityKeyIdentifier` with `issuer` in self-signed certificates.

#### Extensions for Server (server.ext)

```ini
[ v3_ca ]
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:wsl.ymbihq.local,DNS:*.wsl.ymbihq.local,DNS:localhost,IP:127.0.0.1
```

**Characteristics**:
- End-entity certificate (not CA)
- Used for TLS server authentication
- SANs for main domain, subdomains, localhost, and loopback IP

#### Extensions for Client (client.ext)

```ini
[ v3_ca ]
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=clientAuth
subjectAltName=DNS:client.wsl.ymbihq.local
```

**Characteristics**:
- End-entity certificate (not CA)
- Used for TLS client authentication
- Client-specific SAN

### Step 4: Create the Root CA Certificate

```bash
cd pki-test

cosmian kms certificates certify \
  --certificate-id root_ca \
  --generate-key-pair \
  --algorithm rsa4096 \
  --subject-name "CN=Test Root CA,O=Cosmian Test,C=ES" \
  --days 3650 \
  --certificate-extensions ca.ext \
  -t "root-ca" \
  -t "test-pki"
```

**Key Parameters**:
- `--certificate-id root_ca`: Unique ID within the KMS
- `--generate-key-pair`: Automatically generates the key pair
- `--algorithm rsa4096`: RSA key of 4096 bits
- `--days 3650`: 10 years validity
- `--certificate-extensions ca.ext`: Applies CA extensions
- Without `--issuer-certificate-id`: Self-signed certificate

### Step 5: Create the Server Certificate

```bash
cosmian kms certificates certify \
  --certificate-id server_cert \
  --issuer-certificate-id root_ca \
  --generate-key-pair \
  --algorithm rsa2048 \
  --subject-name "CN=wsl.ymbihq.local,O=Cosmian Test,C=ES" \
  --days 365 \
  --certificate-extensions server.ext \
  -t "server" \
  -t "test-pki"
```

**Key Parameters**:
- `--issuer-certificate-id root_ca`: Signed by the root CA
- `--algorithm rsa2048`: RSA key of 2048 bits (sufficient for server)
- `--subject-name`: CN matches the main domain
- `--days 365`: 1 year validity

### Step 6: Create the Client Certificate

```bash
cosmian kms certificates certify \
  --certificate-id client_cert \
  --issuer-certificate-id root_ca \
  --generate-key-pair \
  --algorithm rsa2048 \
  --subject-name "CN=Test Client,O=Cosmian Test,C=ES" \
  --days 365 \
  --certificate-extensions client.ext \
  -t "client" \
  -t "test-pki"
```

**Key Parameters**:
- `--issuer-certificate-id root_ca`: Signed by the root CA
- `--subject-name`: Descriptive client name
- Extensions with `extendedKeyUsage=clientAuth`

### Step 7: Export Certificates in PEM Format

```bash
# Export root CA
cosmian kms certificates export \
  -c root_ca \
  -f pem \
  root_ca.pem

# Export server certificate
cosmian kms certificates export \
  -c server_cert \
  -f pem \
  server_cert.pem

# Export client certificate
cosmian kms certificates export \
  -c client_cert \
  -f pem \
  client_cert.pem
```

### Step 8: Export in PKCS#12 Format (with private keys)

First, get the private key IDs:

```bash
# Get the PrivateKeyLink of the server certificate
cosmian kms attributes get \
  --id server_cert \
  --attribute Link | grep PrivateKeyLink
# Output: "PrivateKeyLink": "fd1c8338-e523-4065-89b4-c86c018c0c7a"

# Get the PrivateKeyLink of the client certificate
cosmian kms attributes get \
  --id client_cert \
  --attribute Link | grep PrivateKeyLink
# Output: "PrivateKeyLink": "c9b5f619-1eca-4f70-bda2-1181205fa9e8"
```

Export with password-protected private keys:

```bash
# Export server (certificate + private key + chain)
# NOTE: For PKCS#12 export, use the PRIVATE KEY ID, not the certificate ID
cosmian kms certificates export \
  -c <PRIVATE_KEY_UUID> \
  -f pkcs12 \
  -p "test123" \
  server.p12

# Export client (certificate + private key + chain)
cosmian kms certificates export \
  -c <PRIVATE_KEY_UUID> \
  -f pkcs12 \
  -p "test123" \
  client.p12
```

**Note**: The password `test123` protects the private keys within the PKCS#12 files.

**Important**: When exporting to PKCS#12 format, you must provide the **private key ID** (obtained from PrivateKeyLink), not the certificate ID. This is because PKCS#12 includes the private key.

### Step 9: Verify the Certificates

#### Verify the trust chain

```bash
openssl verify -CAfile root_ca.pem server_cert.pem
# Output: server_cert.pem: OK

openssl verify -CAfile root_ca.pem client_cert.pem
# Output: client_cert.pem: OK
```

#### Inspect the server certificate

```bash
openssl x509 -in server_cert.pem -text -noout
```

Notable details:
- **Issuer**: CN = Test Root CA, C = ES, O = Cosmian Test
- **Subject**: CN = wsl.ymbihq.local, C = ES, O = Cosmian Test
- **Subject Alternative Names**: DNS:wsl.ymbihq.local, DNS:*.wsl.ymbihq.local, DNS:localhost, IP:127.0.0.1
- **Extended Key Usage**: TLS Web Server Authentication

#### Verify PKCS#12 contents

```bash
# View the certificate
openssl pkcs12 -in server.p12 -nokeys -passin pass:test123 | openssl x509 -noout -subject -issuer
# Output:
# subject=CN = wsl.ymbihq.local, C = ES, O = Cosmian Test
# issuer=CN = Test Root CA, C = ES, O = Cosmian Test

# View the complete chain
openssl pkcs12 -in server.p12 -passin pass:test123 -nokeys
```

## Certificate Management in KMS

### List certificates by tag

```bash
cosmian kms locate -t test-pki
```

### Get certificate attributes

```bash
cosmian kms attributes get --id server_cert
```

### Revoke a certificate

```bash
cosmian kms certificates revoke \
  -c server_cert \
  "Superseded"
```

Possible revocation reasons: Superseded, KeyCompromise, CACompromise, AffiliationChanged, Cessation, PrivilegeWithdrawn, etc.

### Destroy a certificate

**Important**: You must revoke the certificate before destroying it.

```bash
cosmian kms certificates destroy \
  -c server_cert
```

## Using the Certificates

### TLS Server Configuration (nginx example)

```nginx
server {
    listen 443 ssl;
    server_name wsl.ymbihq.local;

    # Server certificate and private key
    ssl_certificate     /path/to/server_cert.pem;
    ssl_certificate_key /path/to/server_key.pem;  # Extracted from PKCS#12

    # CA to verify client certificates (optional)
    ssl_client_certificate /path/to/root_ca.pem;
    ssl_verify_client optional;

    # Recommended SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
}
```

### Extract private key from PKCS#12

```bash
# Extract private key in PEM format
openssl pkcs12 -in server.p12 -nocerts -nodes -passin pass:test123 -out server_key.pem

# Extract certificate
openssl pkcs12 -in server.p12 -clcerts -nokeys -passin pass:test123 -out server_cert_extracted.pem

# Extract CA chain
openssl pkcs12 -in server.p12 -cacerts -nokeys -passin pass:test123 -out ca_chain.pem
```

### TLS Client with Certificate (curl example)

```bash
# Client authentication with certificate
curl --cacert root_ca.pem \
     --cert client_cert.pem \
     --key client_key.pem \
     https://wsl.ymbihq.local
```

## Security Considerations

### For Testing Environment
- Simple passwords (`test123`) are acceptable
- Long validity to avoid renewals
- Certificates stored in KMS with automatic backup

### For Production
- **DO NOT** use simple passwords
- **DO NOT** store private keys without encryption
- Use HSM or secure KeyStore
- Reduce certificate validity (90-365 days)
- Implement automatic rotation
- Configure JWT authentication on KMS
- Enable TLS for the KMS API
- Use a persistent database (PostgreSQL/MySQL)

## Troubleshooting

### Error: "invalid CA certificate"

**Problem**: The CA certificate does not have the correct extensions.

**Solution**: Ensure that `ca.ext` contains:
```ini
basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign
```

### Error: "not supported keyUsage extension's value: cRLSign"

**Problem**: Cosmian KMS does not support certain extension values.

**Solution**: Remove `cRLSign` from the extensions file.

### Error: "unable to get issuer keyid"

**Problem**: Attempting to use `authorityKeyIdentifier=keyid:always,issuer` in a self-signed certificate.

**Solution**: Remove `authorityKeyIdentifier` in self-signed certificates or use only `keyid`.

### Error: "Object with unique identifier: X is active. It must be revoked first"

**Problem**: Attempting to destroy an active certificate.

**Solution**: First revoke the certificate:
```bash
cosmian kms certificates revoke -c X "Superseded"
```

## References

- [Cosmian KMS Documentation](https://docs.cosmian.com/)
- [Cosmian KMS GitHub](https://github.com/Cosmian/kms)
- [Cosmian CLI GitHub](https://github.com/Cosmian/cli)
- [KMIP Specification](https://www.oasis-open.org/committees/tc_home.php?wg_abbrev=kmip)
- [X.509 Certificate Extensions](https://www.rfc-editor.org/rfc/rfc5280)

## Useful Commands Summary

```bash
# Add CLI to PATH
export PATH="$PWD/../contrib:$PATH"

# Or set KMS URL
export KMS_DEFAULT_URL="http://localhost:9998"

# Create self-signed CA certificate
cosmian kms certificates certify --certificate-id root_ca --generate-key-pair \
  --algorithm rsa4096 --subject-name "CN=Test Root CA,O=Cosmian Test,C=ES" \
  --days 3650 --certificate-extensions ca.ext -t root-ca

# Create certificate signed by CA
cosmian kms certificates certify --certificate-id my_cert --issuer-certificate-id root_ca \
  --generate-key-pair --algorithm rsa2048 --subject-name "CN=my-service.domain.local,O=Org,C=ES" \
  --days 365 --certificate-extensions my.ext -t my-service

# Export certificate
cosmian kms certificates export -c my_cert -f pem my_cert.pem

# Verify certificate
openssl verify -CAfile root_ca.pem my_cert.pem

# List all objects
cosmian kms locate

# Get certificate links
cosmian kms attributes get --id my_cert --attribute Link
```

---

**Author**: Claude Code + Oriol
**Date**: 2026-02-24
**KMS Version**: 5.9.0
**CLI Version**: 1.9.0
