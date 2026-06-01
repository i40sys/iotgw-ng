---
id: TASK-033
title: Create Ansible role for SSH key retrieval and PKCS8 to OpenSSH conversion
status: To Do
assignee: []
created_date: '2026-03-02 05:23'
updated_date: '2026-03-02 05:24'
labels:
  - ansible
  - kms
  - security
  - deployment
dependencies:
  - TASK-040
references:
  - >-
    backlog/decisions/decision-010 -
    ADR-001-SSH-Key-Management-with-Cosmian-KMS.md
  - kms/src/kms_tools/convert_keys.py
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create an Ansible role that retrieves SSH keys from Cosmian KMS and converts them from PKCS#8 PEM format to OpenSSH format for deployment to IoT Gateway devices.

## Background

As defined in decision-010 (ADR-001 - SSH Key Management with Cosmian KMS), SSH keys are stored in KMS in PKCS#8 format. IoT Gateway devices (OpenWRT) require OpenSSH format keys. The conversion must happen during deployment using the same logic as `kms/src/kms_tools/convert_keys.py`.

## Technical Implementation

### Ansible Role Structure

```
roles/
└── kms_ssh_key/
    ├── tasks/
    │   └── main.yml
    ├── templates/
    │   └── convert_pkcs8_to_openssh.py.j2
    ├── vars/
    │   └── main.yml
    └── defaults/
        └── main.yml
```

### Main Tasks (tasks/main.yml)

```yaml
---
- name: Export SSH private key from KMS (PKCS8 PEM format)
  ansible.builtin.command:
    cmd: >
      cosmian kms ec keys export
      -k "{{ ssh_key_id }}"
      -f pem
      "{{ temp_key_dir }}/device_key_pkcs8.pem"
  environment:
    COSMIAN_KMS_URL: "{{ kms_url }}"
  register: kms_export_result
  no_log: true  # Don't log key material

- name: Convert PKCS8 to OpenSSH format
  ansible.builtin.script:
    cmd: convert_pkcs8_to_openssh.py
    args:
      - "{{ temp_key_dir }}/device_key_pkcs8.pem"
      - "{{ temp_key_dir }}/id_ed25519"
  register: conversion_result

- name: Deploy private key to device
  ansible.builtin.copy:
    src: "{{ temp_key_dir }}/id_ed25519"
    dest: /root/.ssh/id_ed25519
    mode: '0600'
    owner: root
    group: root
  delegate_to: "{{ device_ip }}"

- name: Deploy public key to device
  ansible.builtin.copy:
    src: "{{ temp_key_dir }}/id_ed25519.pub"
    dest: /root/.ssh/id_ed25519.pub
    mode: '0644'
    owner: root
    group: root
  delegate_to: "{{ device_ip }}"

- name: Add public key to authorized_keys
  ansible.builtin.authorized_key:
    user: root
    state: present
    key: "{{ lookup('file', temp_key_dir + '/id_ed25519.pub') }}"
  delegate_to: "{{ device_ip }}"

- name: Cleanup temporary key files
  ansible.builtin.file:
    path: "{{ temp_key_dir }}"
    state: absent
  no_log: true
```

### Conversion Script (Python)

Based on `kms/src/kms_tools/convert_keys.py`:

```python
#!/usr/bin/env python3
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
import sys

def convert_pkcs8_to_openssh(input_path, output_path):
    # Load PKCS8 PEM private key
    with open(input_path, 'rb') as f:
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
    
    # Write private key
    with open(output_path, 'wb') as f:
        f.write(openssh_private)
    
    # Write public key
    with open(output_path + '.pub', 'wb') as f:
        f.write(openssh_public + b' device-key\n')

if __name__ == '__main__':
    convert_pkcs8_to_openssh(sys.argv[1], sys.argv[2])
```

## Security Considerations

- Use `no_log: true` for tasks handling key material
- Temporary files created in secure directory with restricted permissions
- Immediate cleanup after deployment
- Never log actual key content
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Ansible role kms_ssh_key created with proper structure
- [ ] #2 Task exports PKCS8 PEM key from Cosmian KMS using ssh_key_id variable
- [ ] #3 Python conversion script converts PKCS8 to OpenSSH format correctly
- [ ] #4 Conversion script uses same logic as kms/src/kms_tools/convert_keys.py
- [ ] #5 Private key deployed to /root/.ssh/id_ed25519 with mode 0600
- [ ] #6 Public key deployed to /root/.ssh/id_ed25519.pub with mode 0644
- [ ] #7 Public key added to authorized_keys on device
- [ ] #8 Temporary key files cleaned up after deployment
- [ ] #9 All key-handling tasks use no_log: true
- [ ] #10 Python cryptography library available in Ansible execution environment
- [ ] #11 Role tested with actual KMS key export and device deployment
- [ ] #12 Error handling for KMS export failures
- [ ] #13 Error handling for conversion failures
- [ ] #14 Idempotent execution (can run multiple times safely)
<!-- AC:END -->
