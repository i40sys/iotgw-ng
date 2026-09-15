---
id: TASK-092
title: >-
  Kestra runner: authenticate with an iotgw-ops user certificate instead of
  keys/id_rsa
status: To Do
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-14 07:35'
labels:
  - ssh-ca
  - kestra
  - ansible
milestone: m-1
dependencies:
  - TASK-070
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
  - >-
    backlog/decisions/decision-027-ssh-ca-migration-plan-authorized-keys-to-certificate-coexistence-and-cutover.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Kestra runner currently SSHes with the namespace file `keys/id_rsa`, which is a **personal workstation key** (`oriol@mini6`, `SHA256:kxhsZf7ig6wML+bEtES6Wxtr5hLpV5Hen2D2Mm4xQfg`) — the same key that is in the live image's `authorized_keys` and published via `u.joor.net/ssh-pub-key`. task-069 additionally overwrites it from Cosmian KMS when `SSH_KEY_ID` is set, but that per-device key is not authorised on any gateway (see the ssh_key_id task), so in practice the personal key is what works.

Replace it with a short-lived `iotgw-ops` **certificate** obtained at flow start, set via `ansible_ssh_private_key_file` + `CertificateFile` in the generated inventory.

**The blocking design question is who mints it** — decision-028 §1 (task-070). If the backend mints it and hands it to the pod, no issuance credential ever lands in a runner pod, which is the recorded preference. If the pod mints it, the pod needs a `sign-user`-scoped fleet token, which is a materially weaker posture and must be an explicit choice, not a convenience.

**Mechanically:** the runner also needs a keypair. Generating an ephemeral one per flow run is cleanest (the certificate is short-lived anyway) and means no key at rest; confirm the cert issuance round-trip fits inside the flow's startup without a noticeable delay.

Affects all three flows — `install`, `provisioning`, `connectivity-check`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 install, provisioning and connectivity-check reach a gateway using a certificate, with no personal key involved
- [ ] #2 The certificate is short-lived and obtained per flow run rather than stored in the namespace files
- [ ] #3 No sign-user credential is present in a runner pod unless decision-028 §1 recorded that as the choice
- [ ] #4 keys/id_rsa is no longer required for any of the three flows to run
<!-- AC:END -->
