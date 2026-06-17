---
id: TASK-060.05
title: Update ADR + docs for backend→KMS SSH key generation
status: To Do
assignee: []
created_date: '2026-06-17 04:54'
labels:
  - docs
  - ssh
  - kms
dependencies:
  - TASK-060.04
parent_task_id: TASK-060
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reflect the new architecture in the source-of-truth docs after the code lands. SSH-key *generation* now happens in the iotgw-ui backend via a direct Cosmian KMS call, auto on device INSERT; key *deployment* stays in the install/provisioning Kestra flows; the legacy Kestra devices/networks flows are gone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 decision-010 amended (dated note): generation moved from the Kestra devices flow to a direct backend→Cosmian KMS call, auto on INSERT; deployment unchanged
- [ ] #2 Root CLAUDE.md 'Real Call Chain' / Kestra section updated to state SSH-key generation is backend→KMS direct and the devices/networks Kestra flows were removed
- [ ] #3 kestra/CLAUDE.md and iotgw-ui/apps/backend/CLAUDE.md Kestra-integration notes updated (no SSH-key generation via Kestra)
- [ ] #4 doc-016 'Relationship to Kestra' SSH note updated to match (generateMissingSshKey no longer calls Kestra)
<!-- AC:END -->
