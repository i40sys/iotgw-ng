---
id: TASK-083
title: >-
  Backend: create and link the pki-manager zone when an iotgw-ng domain is
  created
status: To Do
assignee: []
created_date: '2026-09-14 05:29'
labels:
  - ssh-ca
  - backend
milestone: m-1
dependencies: []
references:
  - "backlog/decisions/decision-026-ssh-ca-gateway-provisioning-and-enrollment-sequence.md"
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-026 phase 0.2-0.5 in the iotgw-ui backend, using the OIDC service account (decision-028 §9). On domain create: create the zone, both CAs and the two principals, then persist the ids. Must be re-runnable for domains that already exist, and must fail loudly rather than leaving a half-provisioned zone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Creating a domain results in a zone with one user CA, one host CA and both principals in pki-manager, and the ids persisted on the domain row
- [ ] #2 Re-running against an already-linked domain is a no-op, not a duplicate
- [ ] #3 A pki-manager failure surfaces as an error on the domain record rather than a silent partial state
<!-- AC:END -->
