---
id: TASK-099
title: 'Testing: SSH-CA smoke coverage in verify.sh and the e2e suite'
status: To Do
assignee: []
created_date: '2026-09-14 05:31'
updated_date: '2026-09-14 07:35'
labels:
  - ssh-ca
  - testing
milestone: m-1
dependencies:
  - TASK-086
  - TASK-072
references:
  - >-
    backlog/decisions/decision-026-ssh-ca-gateway-provisioning-and-enrollment-sequence.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
just verify currently covers secret hygiene, SOPS round-trip, kustomize render, ui typecheck+tests and a kind smoke. Add SSH-CA coverage: the ssh-ca edge function answers, a test device can enroll end to end against a container acting as a gateway, and a per-host block is observed to deny then an unblock to restore. Model it on ssh-cert-test/provision.sh, which already does exactly this against the live PKI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 just verify fails if the ssh-ca edge function is broken or a test device cannot enroll
- [ ] #2 The suite asserts certificate acceptance from the sshd log, not merely a successful connection
- [ ] #3 A block/unblock cycle is exercised and asserted
- [ ] #4 No test writes to the production default zone
<!-- AC:END -->
