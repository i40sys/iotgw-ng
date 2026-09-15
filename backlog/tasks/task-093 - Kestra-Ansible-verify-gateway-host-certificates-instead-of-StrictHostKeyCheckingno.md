---
id: TASK-093
title: >-
  Kestra/Ansible: verify gateway host certificates instead of
  StrictHostKeyChecking=no
status: To Do
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-14 07:35'
labels:
  - ssh-ca
  - kestra
  - ansible
  - security
milestone: m-1
dependencies:
  - TASK-089
  - TASK-097
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
  - >-
    backlog/decisions/decision-027-ssh-ca-migration-plan-authorized-keys-to-certificate-coexistence-and-cutover.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Turn on host verification for flows that talk to **provisioned gateways**, now that those gateways present host certificates.

**What disables it today, in five places:** `templates/inventory.j2`, and the generated inventories inside `Flow.yaml` (provisioning), `install-flow.yaml` and `connectivity-check-flow.yaml` — all carry `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`. The provisioning flow's **bastion `ProxyCommand`** carries the same flags a second time, for the hop through `216.45.62.117`, and that one is easy to miss.

**What to do instead:** generate a `known_hosts` file carrying the zone's `@cert-authority` line (the `ssh-ca` edge function already returns a ready-made `cert_authority` string in its bundle), write it alongside the inventory, and set `StrictHostKeyChecking=yes -o UserKnownHostsFile=<that file>`.

**The connect name has to match a certificate principal**, or verification falls back to TOFU and silently gains nothing. The inventory addresses gateways by IP; the edge function includes the IP as a host principal *for now*, but whether it stays is an open decision. So either set `HostKeyAlias` to the certified FQDN, or depend on that decision. `HostKeyAlias` is the more robust choice and is already the pattern in the operator `~/.ssh/config`.

**The bastion is a separate problem.** `216.45.62.117` is not an iotgw-ng gateway and has no certificate from our Host CA, so it cannot be verified this way. Decide explicitly whether it gets a pinned host key, its own certificate, or keeps TOFU with that documented — do not leave it silently disabled and call the task done.

**Out of scope:** the live-boot phase keeps TOFU until decision-028 §5 is resolved. Make that explicit in the flow rather than letting it fall out of a global flag.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A flow against a provisioned gateway verifies its host certificate, and fails if the certificate is absent, expired or wrong
- [ ] #2 The connect name matches a certificate principal, verified by observing that no TOFU fallback occurred
- [ ] #3 The bastion hop's verification posture is an explicit, documented choice
- [ ] #4 The live-boot phase's TOFU is explicit in the flow, not a side effect of a global flag
- [ ] #5 All five StrictHostKeyChecking=no sites are accounted for, including the ProxyCommand
<!-- AC:END -->
