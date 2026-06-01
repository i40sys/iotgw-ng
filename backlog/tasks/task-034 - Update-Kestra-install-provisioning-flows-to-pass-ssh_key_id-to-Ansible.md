---
id: TASK-034
title: Update Kestra install/provisioning flows to pass ssh_key_id to Ansible
status: To Do
assignee: []
created_date: '2026-03-02 05:23'
updated_date: '2026-03-02 05:24'
labels:
  - kestra
  - workflow
  - deployment
  - kms
dependencies:
  - TASK-033
  - TASK-040
references:
  - >-
    backlog/decisions/decision-010 -
    ADR-001-SSH-Key-Management-with-Cosmian-KMS.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Modify the Kestra `iotgw-ng/install` and `iotgw-ng/provisioning` workflows to include the `ssh_key_id` parameter and pass it to the Ansible playbook for SSH key deployment.

## Background

As defined in decision-010 (ADR-001 - SSH Key Management with Cosmian KMS), device deployments must retrieve the SSH key from KMS using the `ssh_key_id` stored in Supabase. The Kestra deployment flows need to accept this parameter and pass it to Ansible.

## Technical Implementation

### Update Flow Inputs

Add `ssh_key_id` to the flow inputs schema:

```yaml
inputs:
  - id: device_id
    type: STRING
    required: true
  - id: device_name
    type: STRING
    required: true
  - id: ssh_key_id
    type: STRING
    required: true
    description: "KMS object ID for device SSH key (e.g., device_ssh_<uuid>)"
  - id: target_ip
    type: STRING
    required: true
  # ... other existing inputs
```

### Pass to Ansible Playbook

Update the Ansible task to include ssh_key_id as extra variable:

```yaml
- id: run_ansible_playbook
  type: io.kestra.plugin.ansible.cli.AnsibleCLI
  description: Run device deployment playbook with SSH key
  commands:
    - >
      ansible-playbook deploy_device.yml
      -i "{{ inputs.target_ip }},"
      -e "device_id={{ inputs.device_id }}"
      -e "device_name={{ inputs.device_name }}"
      -e "ssh_key_id={{ inputs.ssh_key_id }}"
      -e "kms_url=${COSMIAN_KMS_URL}"
```

### Validation Task

Add validation before Ansible execution:

```yaml
- id: validate_ssh_key_exists
  type: io.kestra.plugin.scripts.shell.Commands
  description: Verify SSH key exists in KMS before deployment
  commands:
    - |
      # Check if key exists in KMS
      cosmian kms ec keys export \
        -k "{{ inputs.ssh_key_id }}" \
        -f pem \
        /dev/null 2>&1 || {
          echo "ERROR: SSH key '{{ inputs.ssh_key_id }}' not found in KMS"
          exit 1
        }
      echo "SSH key validated successfully"
```

## Affected Flows

1. `iotgw-ng/install` - OS installation deployment
2. `iotgw-ng/provisioning` - Full device provisioning

## Integration with Backend

The tRPC `executeKestraDeployment` mutation in `apps/backend/src/routers/deployments.ts` must be updated to include `ssh_key_id` in the Kestra execution inputs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ssh_key_id input added to iotgw-ng/install flow definition
- [ ] #2 ssh_key_id input added to iotgw-ng/provisioning flow definition
- [ ] #3 ssh_key_id marked as required input in both flows
- [ ] #4 Validation task checks key exists in KMS before deployment
- [ ] #5 ssh_key_id passed to Ansible playbook as extra variable
- [ ] #6 KMS URL passed to Ansible as environment/variable
- [ ] #7 Flow fails gracefully if ssh_key_id is missing or invalid
- [ ] #8 Error messages clearly indicate SSH key issues
- [ ] #9 Integration tested with kms_ssh_key Ansible role
- [ ] #10 Deployment jobs table updated to capture ssh_key_id in configuration snapshot
<!-- AC:END -->
