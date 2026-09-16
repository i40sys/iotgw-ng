---
id: TASK-096
title: >-
  Operator tooling: just ssh-trust for per-domain @cert-authority and user
  certificates
status: Done
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-16 04:22'
labels:
  - ssh-ca
  - tooling
milestone: m-1
dependencies:
  - TASK-070
references:
  - >-
    backlog/decisions/decision-024-ssh-ca-target-architecture-iotgw-ng-consumes-pki-manager-one-zone-per-domain.md
  - >-
    backlog/decisions/decision-027-ssh-ca-migration-plan-authorized-keys-to-certificate-coexistence-and-cutover.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operators must stop pinning per-gateway host fingerprints. Provide scripts/ssh-ca/trust.sh (write each domain's @cert-authority line into ~/.ssh/known_hosts.d/iotgw-<domain> plus a scoped ~/.ssh/config block) and scripts/ssh-ca/user-cert.sh (request and install a short-lived user certificate). Note the existing global 'Host *  StrictHostKeyChecking no' block, which would otherwise defeat host-certificate verification.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An operator who has run scripts/ssh-ca/trust.sh can SSH to a freshly enrolled gateway with no host-key prompt and no new known_hosts entry
- [x] #2 Re-running the tool is idempotent and never rewrites unrelated known_hosts or ssh_config lines
- [x] #3 The interaction with the operator's existing global 'Host * StrictHostKeyChecking no' is documented and handled
- [x] #4 scripts/ssh-ca/user-cert.sh exists and installs a short-lived user certificate next to the operator's key, so ssh picks it up automatically
- [x] #5 Renewing an expired certificate is one documented command that needs no new key
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**AC#1 PROVEN 2026-09-16 — task-096 DONE.** scripts/ssh-ca/trust.sh (run with SSH_DIR override + DOMAIN_CA_MAP for warehouse->host CA f3a2fbda) wrote the @cert-authority *.warehouse.iotgw line + a scoped config with StrictHostKeyChecking=yes. SSH to the enrolled canary using ONLY that output (HostKeyAlias=iot-gateway-warehouse.warehouse.iotgw + a minted iotgw-admin user cert) -> logged in with NO host-key prompt and ZERO new known_hosts pins. All 5 ACs met (trust.sh + user-cert.sh both proven end-to-end against live pki.joor.net and a real enrolled OpenWRT gateway).
<!-- SECTION:NOTES:END -->
