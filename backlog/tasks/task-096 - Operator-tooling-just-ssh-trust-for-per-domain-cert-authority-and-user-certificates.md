---
id: TASK-096
title: >-
  Operator tooling: just ssh-trust for per-domain @cert-authority and user
  certificates
status: In Progress
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-14 07:35'
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
- [ ] #4 scripts/ssh-ca/user-cert.sh exists and installs a short-lived user certificate next to the operator's key, so ssh picks it up automatically
- [ ] #5 Renewing an expired certificate is one documented command that needs no new key
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Trust rollout written and tested against a scratch SSH dir; user-cert helper still to write.**

**What changed:** new `scripts/ssh-ca/trust.sh`. Per domain it fetches that domain's Host CA from `GET /ssh/cas/:id/ca.pub` and writes `~/.ssh/known_hosts.d/iotgw-<domain>` holding one `@cert-authority *.<domain>.iotgw …` line, plus `~/.ssh/config.d/iotgw-ca.conf` with a `Host *.iotgw` block. The domain→CA-id map comes from `domains.pki_host_ca_id` in the cluster, with `DOMAIN_CA_MAP=` as the escape hatch for a workstation with no cluster access.

**AC#2 (idempotent, no collateral edits):** it never touches `~/.ssh/known_hosts` and never edits an unrelated `Host` block. Its own per-domain file holds exactly one line and is rewritten wholesale, so a CA rotation is picked up with no merge logic.

**AC#3 (the global `StrictHostKeyChecking no`):** handled, and this is the subtle part. The operator's `~/.ssh/config` has a catch-all `Host *` block with `StrictHostKeyChecking no`, which would silently defeat host-certificate verification. OpenSSH takes the **first** value it sees for a keyword, so the script *prepends* its `Include` and sets `StrictHostKeyChecking yes` explicitly inside the `*.iotgw` block. It prints why.

**Verified:** run against `SSH_DIR=/tmp/sshdir-test` it produced the expected three files and the correct `@cert-authority` line for the `warehouse` domain, without touching the real `~/.ssh`.

**AC#1 not ticked:** the end-to-end "no host-key prompt, no new known_hosts entry" behaviour **was** proven in task-086 (against a real sshd using a hand-built known_hosts from the same bundle), but not yet through this script against a real gateway.

**Remaining:** `scripts/ssh-ca/user-cert.sh` (wrap `POST /api/v1/ssh/users/issue`, install `~/.ssh/iotgw-<domain>-cert.pub`). The flow it automates was exercised by hand for the pilot zone.
<!-- SECTION:NOTES:END -->
