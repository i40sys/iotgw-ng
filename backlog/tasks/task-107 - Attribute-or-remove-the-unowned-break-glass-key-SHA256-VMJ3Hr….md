---
id: TASK-107
title: 'Attribute or remove the unowned break-glass key SHA256:VMJ3Hr…'
status: Done
assignee: []
created_date: '2026-09-14 07:09'
updated_date: '2026-09-15 14:36'
labels:
  - ssh-ca
  - security
  - cleanup
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-027-ssh-ca-migration-plan-authorized-keys-to-certificate-coexistence-and-cutover.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`/root/.ssh/authorized_keys` in the live image — confirmed still in force on a running instance at 10.2.0.210 — carries three keys, and one of them, `SHA256:VMJ3HrTXUAmqTcnUPmJS4sTusMTcOLT8t424geeKfwg` (RSA-2048, no comment), **has no known owner**.

This is small but it blocks real work. The break-glass set is the one thing the migration deliberately keeps forever (decision-028 §11), and the condition attached to keeping it is that every entry is attributed. An unowned key in the permanent emergency-access set is exactly what the CA model is supposed to eliminate, and it cannot be revoked by any KRL because a raw key is not a certificate.

Check whether it also reached deployed gateways: `enable_ansible.sh` builds gateway `authorized_keys` from `github.com/sabatligats.keys` + `u.joor.net`, and this fingerprint matches neither, so it may be live-image-only — but that should be verified on a real gateway rather than inferred.

Outcome is binary: name the owner and record it, or remove the key.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The key is either attributed to a named owner in a durable record, or removed
- [x] #2 It is established by inspection whether the key is also present on deployed gateways, not inferred from the playbooks
- [x] #3 If it is removed, a machine booted from the rebuilt image is confirmed still reachable by the remaining break-glass keys before the change is considered done
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**AC#3 done 2026-09-15:** on the rebuilt image booted at 10.2.0.210, the remaining break-glass keys were confirmed working BEFORE finalizing — logged in with id_rsa (oriol@mini6, SHA256:kxhsZf7…). The unattributed SHA256:VMJ3Hr… is gone from the served image (authorized_keys = 2 attributed keys). Removal shipped via the task-095 swap.
<!-- SECTION:NOTES:END -->
