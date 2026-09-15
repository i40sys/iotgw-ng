---
id: TASK-100
title: >-
  Cleanup: retire the shared fleet private key and the legacy authorized_keys
  plumbing
status: To Do
assignee: []
created_date: '2026-09-14 05:31'
updated_date: '2026-09-14 07:35'
labels:
  - ssh-ca
  - cleanup
  - security
milestone: m-1
dependencies:
  - TASK-098
  - TASK-073
  - TASK-092
  - TASK-107
references:
  - >-
    backlog/decisions/decision-027-ssh-ca-migration-plan-authorized-keys-to-certificate-coexistence-and-cutover.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-027 phase 5, strictly ordered and only after the phase-4 gate passes. Remove files/credentials/id_rsa{,.pub} (a single RSA-3072 private key installed on every gateway whose public half is published on a GitHub profile), the tasks/system.yaml copies of it, the keys/id_rsa namespace file, the wget-based authorized_keys block, and the remaining StrictHostKeyChecking=no. Narrow gateway authorized_keys to the named break-glass set — never empty it. The 12 tasks/*.yaml that use /root/.ssh/id_rsa as a docker key_file must be re-pointed first (decision-028 §7).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No shared private key is present in either repo, in the Kestra namespace blob, or on any gateway
- [ ] #2 No gateway's authorized_keys is built from a third-party download
- [ ] #3 The named break-glass set is still present and still works on every gateway
- [ ] #4 Every removal was done after its gate passed, and each is individually revertible
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Divergence to respect when doing the removal (found 2026-09-14):** the Kestra copy of `tasks/system.yaml` already gates the shared-key deployment behind `deploy_shared_ssh_key | default(false) | bool`; the `owrt_iot_gw` copy does not. Do not force-sync one over the other — remove from both deliberately.

**Also:** the unattributed break-glass key `SHA256:VMJ3Hr…` must be resolved before the "narrow authorized_keys to the named break-glass set" step can mean anything; it has its own task.
<!-- SECTION:NOTES:END -->
