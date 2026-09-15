---
id: TASK-071
title: 'Resolve decision-028 §5: live-image host identity and installer trust scope'
status: Done
assignee: []
created_date: '2026-09-14 05:28'
updated_date: '2026-09-15 04:41'
labels:
  - ssh-ca
  - decision
  - live-image
milestone: m-1
dependencies:
  - TASK-075
references:
  - >-
    backlog/decisions/decision-028-ssh-ca-open-security-and-architecture-decisions.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decide how the OS-install phase gets server authentication, and which User CAs the live image trusts. Blocks decision-027 phase 1 sign-off.

**Corrected premise (2026-09-14, measured on a live-booted gateway at 10.2.0.210 — the original wording of this task was wrong):**
- The squashfs **at rest** has no `ssh_host_*` files, but the **running** live system generates an `ssh_host_ecdsa_key` at boot. So a live machine IS signable and IS ECIES-capable with no image change.
- `Include /etc/ssh/sshd_config.d/*.conf` is already present in the image's `sshd_config` and the drop-in dir is empty, so drop-ins work out of the box. `openssl`, `python3`, `curl` and `ssh-keygen` are all present.
- Option C (live image self-enrolls a short-lived host cert) was demonstrated end to end: an ephemeral host key signed by the pilot Host CA, 4-hour validity, installed, `sshd -t` + reload accepted, and a client trusting only the `@cert-authority` line connected with `StrictHostKeyChecking=yes` and added no `known_hosts` entry.
- The image reports `System clock synchronized: no`. Skew happened to be 135 s, which is inside the +/-600 s TOTP window and inside cert tolerance — but that is luck, so any self-enrollment must sync the clock first.

**So the mechanics are settled; what is NOT settled is the identity binding.** In that demonstration an operator did the signing — the live machine never proved who it was. A live machine has no device row and its `maquina_id` is typed by a human at the iPXE prompt, which is a weak binding. This is the same gap as decision-028 section 12, and it is the real content of this decision.

The second half is scope: the live image cannot know which domain a machine will join, so trusting every zone's User CA means any `iotgw-admin` in any domain can log into any machine during its install phase. The alternative is a dedicated installer zone with its own `iotgw-installer` principal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 decision-028 §5 records a chosen option for live-phase host verification, with the residual exposure written down and explicitly accepted
- [x] #2 The identity-binding question is answered: either the live machine proves who it is before a host cert is signed, or it is recorded that operator-driven signing is accepted and why
- [x] #3 decision-028 §5 records whether the live image trusts every zone's User CA or a dedicated installer zone/principal, and why
- [x] #4 The provisioning network's isolation is stated as a fact that was checked (who can reach the PXE segment), not assumed
- [x] #5 If self-enrollment is chosen, the clock-sync prerequisite is part of the design, not a footnote
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Resolved 2026-09-15 (decision-028 §5).**

- **AC#1/#2 — host verification:** chose Option C (live self-enrolls a short-lived host cert) bound to the **device_id+OTP** channel that already exists in the served menu.ipxe (`vpn` item: read device_id + read otp, TOTP/decision-009), NOT the free-text `maquina_id` of the backup/restore path. That OTP channel is the identity proof (ties to §12/task-075). Residual TOFU exposure until task-095 ships the self-enrolling image is accepted, scoped to the isolated bench.
- **AC#3 — trust scope:** live image trusts **every zone's User CA**; acceptable because the bench is isolated. Condition recorded: revisit → dedicated iotgw-installer zone if the image is ever used off-premises.
- **AC#4 — network isolation (checked):** provisioning segment is an isolated lab bench; no shared L2 with production/office.
- **AC#5 — clock sync:** re-verified live on 10.2.0.210 (`System clock synchronized: no`); self-enrollment must NTP-sync before requesting a time-bound cert. Recorded as a design step for task-095.

Implementation of the self-enrolling image + CA-trust install is task-095 (dependent).
<!-- SECTION:NOTES:END -->
