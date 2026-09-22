---
id: TASK-100
title: >-
  Cleanup: retire the shared fleet private key and the legacy authorized_keys
  plumbing
status: Done
assignee: []
created_date: '2026-09-14 05:31'
updated_date: '2026-09-22 12:02'
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
**CLOSED-NOT-IMPLEMENTED (2026-09-22): parked — there is no fleet at current scale.** Marked Done to stop tracking; the legacy shared key / authorized_keys plumbing was deliberately NOT retired.

WHY: retiring break-glass is only safe AFTER a whole fleet is cert-enrolled and the phase-4 gate (task-098) passes — which is parked (no fleet). With a single canary, keeping the break-glass authorized_keys path is correct (decision-027 keeps it alongside during migration). The cert path is proven; removing the fallback now would add risk for no benefit. Revisit only if a real fleet is enrolled.
<!-- SECTION:NOTES:END -->
