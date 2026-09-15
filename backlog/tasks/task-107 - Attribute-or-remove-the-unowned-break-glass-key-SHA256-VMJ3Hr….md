---
id: TASK-107
title: 'Attribute or remove the unowned break-glass key SHA256:VMJ3Hr…'
status: In Progress
assignee: []
created_date: '2026-09-14 07:09'
updated_date: '2026-09-15 09:03'
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
- [ ] #3 If it is removed, a machine booted from the rebuilt image is confirmed still reachable by the remaining break-glass keys before the change is considered done
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**2026-09-15:** decided to REMOVE the unattributed break-glass key SHA256:VMJ3HrTXUAmqTcnUPmJS4sTusMTcOLT8t424geeKfwg (user call — nobody claims it; decision-028 §11 requires every break-glass entry be attributed). The live-image removal is implemented in scripts/live-image/rebuild.sh --drop-key-fp and validated end-to-end (2 attributed keys kept: oriol@mini6, root@iot-gw). Remaining: apply on the y0 tree during the task-095 rebuild, and remove/attribute any copies outside the live image (e.g. gateways) if present.
<!-- SECTION:NOTES:END -->
