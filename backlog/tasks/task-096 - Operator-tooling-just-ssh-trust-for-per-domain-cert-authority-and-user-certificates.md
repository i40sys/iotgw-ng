---
id: TASK-096
title: >-
  Operator tooling: just ssh-trust for per-domain @cert-authority and user
  certificates
status: In Progress
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-15 05:17'
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
- [ ] #1 An operator who has run scripts/ssh-ca/trust.sh can SSH to a freshly enrolled gateway with no host-key prompt and no new known_hosts entry
- [x] #2 Re-running the tool is idempotent and never rewrites unrelated known_hosts or ssh_config lines
- [x] #3 The interaction with the operator's existing global 'Host * StrictHostKeyChecking no' is documented and handled
- [x] #4 scripts/ssh-ca/user-cert.sh exists and installs a short-lived user certificate next to the operator's key, so ssh picks it up automatically
- [x] #5 Renewing an expired certificate is one documented command that needs no new key
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**2026-09-15:** added scripts/ssh-ca/user-cert.sh (AC#4) + documented renewal (AC#5).

- Contract taken from pki.joor.net/api/v1/openapi.json: POST /api/v1/ssh/users/issue (Bearer JWT = operators OWN OIDC token; the iotgw-ng fleet token cannot sign-user, §9). Body {identityId, sshPublicKey, principals:[iotgw-admin], validForSeconds:86400=24h per §1}; identityId resolved via GET /api/v1/ssh/identities matched on subject/email; response cert read from certOpenssh (same field the verified sign-host path uses).
- Installs the cert as <IdentityFile>-cert.pub so OpenSSH auto-loads it; trust.sh already documents that pickup.
- AC#5: renewal = re-run the same command, no new key (documented in the script header + Done message).
- Verified: bash -n clean, shellcheck clean, fail-fast on missing token/subject/pubkey.

**AC#1 still OPEN** (operator SSHes to a freshly ENROLLED gateway with no host-key prompt / no new known_hosts) — needs a live enrolled gateway; hardware/e2e. Task stays In Progress.
<!-- SECTION:NOTES:END -->
