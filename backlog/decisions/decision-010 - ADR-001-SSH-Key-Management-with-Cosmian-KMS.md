---
id: decision-010
title: SSH Key Management with Cosmian KMS
type: other
created_date: '2026-02-26 06:16'
updated_date: '2026-06-17'
---
# SSH Key Management with Cosmian KMS

## Status

**Accepted (amended)** | Date: 2026-02-26 | Amended: 2026-06-17

> **Amendment (2026-06-17, task-060).** The original design placed SSH-key
> **generation** in the Kestra `devices` workflow (triggered via the
> `kestra-call` edge function). That hop is gone: device/network provisioning
> moved to the `netmaker-call` edge function, and the legacy Kestra
> `devices`/`networks` flows were removed. **SSH-key generation now happens
> directly in the iotgw-ui backend** (`apps/backend/src/services/kms.ts`),
> which talks to Cosmian KMS over its **KMIP 2.1 JSON REST API**
> (`POST <KMS_URL>/kmip/2_1`) and derives the OpenSSH public key locally with
> `node:crypto` — no `cosmian` CLI binary and no Python `convert_keys.py` in the
> backend runtime. Generation runs **automatically when a device is created**
> (`createDevice`, best-effort: a KMS failure leaves the device without a key
> rather than failing creation) and on demand via `generateMissingSshKey`
> (backfill / `force` regenerate). `KMS_URL` is env-sourced from `secrets/`
> (decision-014); the KMS has no auth in dev (the client is auth-header-ready).
> Key **deployment** to the device (export → OpenSSH → push) is **unchanged** —
> it stays in the install/provisioning Kestra flows (Ansible to the gateway).
> The "Key Generation (Kestra Workflow)" section below is therefore superseded
> for the generation step; the tagging convention and `device_ssh_<id>` id
> format are retained.

## Context

When deploying IoT Gateway devices, we need to provision SSH keys for secure remote management. Currently, the system generates WireGuard keys that are stored directly in Supabase. However, SSH keys require different security considerations:

1. **Security**: SSH private keys should never be stored in plain text in the application database
2. **Auditability**: Key access and usage should be tracked for compliance
3. **Key Lifecycle**: Keys need proper management (creation, rotation, revocation, destruction)
4. **Format Requirements**: OpenWRT/IoT devices require OpenSSH format keys, but enterprise KMS systems typically store keys in PKCS#8 format

We have a Cosmian KMS instance available that provides enterprise-grade key management capabilities with KMIP compliance.

## Decision

We will use **Cosmian KMS** as the authoritative store for device SSH keys. The Supabase database will only store a reference (object ID) to the key in KMS, never the actual key material.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            Device Creation Flow                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌──────────┐     ┌──────────────┐     ┌────────────┐     ┌─────────────────────┐
│ Frontend │────►│ tRPC Backend │────►│ Supabase   │────►│ Webhook → Edge Fn   │
│          │     │              │     │ (INSERT)   │     │ (kestra-call)       │
└──────────┘     └──────────────┘     └────────────┘     └──────────┬──────────┘
                                                                     │
                                                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Kestra Workflow                                     │
│  ┌─────────────────────┐     ┌─────────────────────┐     ┌──────────────────┐  │
│  │ 1. Generate SSH Key │────►│ 2. Store in KMS     │────►│ 3. Return Key ID │  │
│  │    (Ed25519)        │     │    (PKCS#8 format)  │     │    to Supabase   │  │
│  └─────────────────────┘     └─────────────────────┘     └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Device Deployment Flow                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌─────────────────────────────────────────────────────────┐
│ Kestra       │────►│ Ansible Playbook                                        │
│ (install/    │     │  ┌───────────────┐  ┌─────────────┐  ┌───────────────┐ │
│ provisioning)│     │  │ 1. Fetch key  │─►│ 2. Convert  │─►│ 3. Deploy to  │ │
│              │     │  │    from KMS   │  │ PKCS8→SSH   │  │    device     │ │
│              │     │  │    (by ID)    │  │             │  │               │ │
│              │     │  └───────────────┘  └─────────────┘  └───────────────┘ │
└──────────────┘     └─────────────────────────────────────────────────────────┘
```

### Data Model Changes

#### devices table (Supabase)

Add new column to store KMS key reference:

```sql
ALTER TABLE devices ADD COLUMN ssh_key_id VARCHAR(255) NULL;

COMMENT ON COLUMN devices.ssh_key_id IS 
  'Reference to SSH key object in Cosmian KMS. Format: <key_id> (e.g., "device_ssh_key_<device_id>")';
```

The `ssh_key_id` stores the KMS object identifier, NOT the key material.

### Key Generation (Kestra Workflow)

When a device is created, the Kestra `devices` workflow will:

1. **Generate Ed25519 key pair** in Cosmian KMS:
   ```bash
   cosmian kms ec keys create \
     --curve ed25519 \
     -t ssh-key \
     -t device-${DEVICE_ID} \
     device_ssh_${DEVICE_ID}
   ```

2. **Tag the key** for searchability:
   - `ssh-key` - identifies as SSH key
   - `device-${DEVICE_ID}` - links to specific device
   - `network-${NETWORK_ID}` - links to network
   - `domain-${DOMAIN_ID}` - links to domain

3. **Return key ID** to Supabase via the Edge Function callback

### Key Retrieval and Conversion (Ansible Playbook)

During device deployment, the Ansible playbook will:

1. **Export key from KMS** (PKCS#8 PEM format):
   ```bash
   cosmian kms ec keys export \
     -k {{ ssh_key_id }} \
     -f pem \
     /tmp/device_key_pkcs8.pem
   ```

2. **Convert to OpenSSH format** using Python cryptography library:
   ```python
   from cryptography.hazmat.backends import default_backend
   from cryptography.hazmat.primitives import serialization

   # Load PKCS8 PEM
   with open('/tmp/device_key_pkcs8.pem', 'rb') as f:
       private_key = serialization.load_pem_private_key(
           f.read(), password=None, backend=default_backend()
       )

   # Convert to OpenSSH format
   openssh_private = private_key.private_bytes(
       encoding=serialization.Encoding.PEM,
       format=serialization.PrivateFormat.OpenSSH,
       encryption_algorithm=serialization.NoEncryption(),
   )

   # Get public key in OpenSSH format
   public_key = private_key.public_key()
   openssh_public = public_key.public_bytes(
       encoding=serialization.Encoding.OpenSSH,
       format=serialization.PublicFormat.OpenSSH
   )

   # Write files
   with open('/tmp/id_ed25519', 'wb') as f:
       f.write(openssh_private)

   with open('/tmp/id_ed25519.pub', 'wb') as f:
       f.write(openssh_public + b' device-key\n')
   ```

3. **Deploy to device** via SSH/SCP

4. **Cleanup temporary files** after deployment

### Kestra Flow Parameters

The `iotgw-ng/devices` and `iotgw-ng/install` flows will receive:

```yaml
inputs:
  device_id: "{{ device.id }}"
  device_name: "{{ device.name }}"
  ssh_key_id: "{{ device.ssh_key_id }}"  # NEW: KMS object ID
  network_id: "{{ device.network_id }}"
  # ... other existing parameters
```

### Security Considerations

1. **Key Material Never in Supabase**: Only the KMS object ID is stored in PostgreSQL
2. **KMS Authentication**: Kestra/Ansible authenticate to KMS using service credentials
3. **Temporary Files**: Conversion happens in-memory or with immediate cleanup
4. **Audit Trail**: KMS logs all key access operations
5. **Key Revocation**: Revoking in KMS immediately prevents deployment
6. **Non-Exportable Option**: Production keys can use `--sensitive` flag

### Key Lifecycle Management

| Event | Action |
|-------|--------|
| Device Created | Generate key in KMS, store ID in Supabase |
| Device Deployed | Export from KMS, convert, deploy, cleanup |
| Device Deleted | Revoke and destroy key in KMS |
| Key Rotation | Create new key, update ID, redeploy |
| Security Incident | Revoke key in KMS immediately |

### KMS Tagging Convention

```
ssh-key                    # Key type identifier
device-{device_id}         # Link to device
network-{network_id}       # Link to network  
domain-{domain_id}         # Link to domain
created-{timestamp}        # Creation timestamp
```

## Consequences

### Positive

- **Enhanced Security**: Private keys never stored in application database
- **Audit Compliance**: Full audit trail of key access in KMS
- **Centralized Management**: Single source of truth for all SSH keys
- **Key Lifecycle**: Proper revocation and destruction capabilities
- **Separation of Concerns**: Application handles logic, KMS handles cryptography

### Negative

- **Dependency**: Adds Cosmian KMS as a critical infrastructure component
- **Latency**: Key retrieval adds network round-trip during deployment
- **Complexity**: Additional conversion step in Ansible playbook
- **Availability**: KMS must be available for device deployments

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| KMS unavailable | Implement retry logic, alert on failures |
| Key ID mismatch | Validate key exists before deployment |
| Conversion failure | Use proven cryptography library, add error handling |
| Orphaned keys | Cleanup job to find keys without device references |

## Implementation Tasks

1. **Database Migration**: Add `ssh_key_id` column to devices table
2. **Kestra Workflow Update**: Add key generation step to `devices` flow
3. **Ansible Playbook**: Create key retrieval and conversion tasks
4. **Edge Function Update**: Handle `ssh_key_id` in job tracking
5. **Backend API**: Expose key ID in device queries (not key material)
6. **Frontend**: Show key status indicator (exists/missing)
7. **Key Cleanup Job**: Background task to cleanup orphaned keys

## References

- [Cosmian KMS Documentation](https://docs.cosmian.com/)
- [kms/src/kms_tools/convert_keys.py](../kms/src/kms_tools/convert_keys.py) - Conversion logic
- [kms/ssh-test/README.md](../kms/ssh-test/README.md) - SSH key workflow examples
- [Python Cryptography Library](https://cryptography.io/)
- [RFC 8709 - Ed25519 and Ed448 Public Key Algorithms](https://www.rfc-editor.org/rfc/rfc8709)
