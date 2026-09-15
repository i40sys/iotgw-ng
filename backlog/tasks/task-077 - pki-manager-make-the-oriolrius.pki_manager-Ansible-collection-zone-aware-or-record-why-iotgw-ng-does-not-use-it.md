---
id: TASK-077
title: >-
  Decide whether iotgw-ng uses the oriolrius.pki_manager collection at all, and
  act on it
status: To Do
assignee: []
created_date: '2026-09-14 05:29'
updated_date: '2026-09-14 07:35'
labels:
  - ssh-ca
  - pki-manager
  - ansible
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
This was written as an "either/or" and is really an unresolved decision, so state it as one and close it.

**The facts:** the published `oriolrius.pki_manager` Ansible collection drives the **legacy unscoped** pki-manager endpoints, which serve the **default** zone only. iotgw-ng needs one zone per domain, so the collection as published cannot enroll an iotgw-ng gateway into the right trust domain.

**What was built instead:** `tasks/ssh_ca.yaml` talks to the `ssh-ca` edge function, not to pki-manager. That is not only a workaround for the collection — it is also how the fleet token stays out of the runner pod and how enrollment reuses the device TOTP (decision-024 §3). So even a zone-aware collection would not obviously be the right tool here.

**Decide one of:**
(a) the collection gains a `zone` parameter and iotgw-ng adopts it, replacing `tasks/ssh_ca.yaml` — which would mean putting a fleet token in the runner pod, contradicting decision-024 §3, so this needs an explicit answer to that;
(b) iotgw-ng deliberately does not use the collection; record why in decision-025 §E so nobody "fixes" it later by adopting it.

**(b) is the likely answer** given the token-placement argument, but it has not been decided, and the collection's README currently implies it is the supported path for SSH host-cert deployment.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 decision-025 §E records the decision and, if the collection is not used, the token-placement reasoning that rules it out
- [ ] #2 If the collection is adopted, the fleet token's placement in a runner pod is explicitly reconciled with decision-024 §3
- [ ] #3 The pki-manager repo's ansible/README no longer implies a path iotgw-ng does not take, or iotgw-ng's docs say why it diverges
<!-- AC:END -->
