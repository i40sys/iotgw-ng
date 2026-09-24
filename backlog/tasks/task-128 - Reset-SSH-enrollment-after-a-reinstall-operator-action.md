---
id: TASK-128
title: Reset SSH enrollment after a reinstall (operator action)
status: Done
assignee: []
created_date: '2026-09-24 15:28'
updated_date: '2026-09-24 15:28'
labels:
  - ssh-ca
  - backend
  - ui
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Found on gw-c3 (2026-09-24):** a reinstalled gateway can never enroll again — ssh-ca (task-075) demands a continuity signature from the previously enrolled host key, which the reinstall destroyed; there was no UI/backend way out (offboard only on delete, and it is terminal for the fqdn).

**Done:** backend `resetSshEnrollment {id, reason}` clears `devices.ssh_host_pubkey` (logged with the reason); device page "Reset enrollment" button + confirm dialog (en/es). The next enroll re-keys the same pki-manager host. With decision-032 §12 the daemon then enrolls the gateway by itself.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An operator can reset a device's SSH enrollment from the device page with a reason
- [x] #2 After the reset the reinstalled gateway enrolls (same fqdn, new key)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Verified on gw-c3:** resetSshEnrollment → `iotgw ssh refresh` enrolled the reinstalled gateway against the real pki-manager (gw-c3-9a8ce31d.c3.comforsa.iotgw, valid until 2026-12-23); Host CA HEALTHY.
<!-- SECTION:NOTES:END -->
