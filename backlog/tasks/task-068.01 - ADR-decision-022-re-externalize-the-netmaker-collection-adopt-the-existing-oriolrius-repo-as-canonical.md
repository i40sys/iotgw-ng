---
id: TASK-068.01
title: >-
  ADR (decision-022): re-externalize the netmaker collection; adopt the existing
  oriolrius repo as canonical
status: Done
assignee: []
created_date: '2026-06-25 14:16'
updated_date: '2026-06-25 14:34'
labels:
  - ansible
  - galaxy
  - adr
  - docs
milestone: Extract netmaker collection to its own repo
dependencies: []
references:
  - >-
    backlog/decisions/decision-012 -
    Workspace-Git-Consolidation-into-a-Single-Root-Repository.md
  - >-
    backlog/decisions/decision-013 -
    Monorepo-Organization-Single-Repo-with-Logical-Grouping.md
  - >-
    backlog/decisions/decision-021 -
    Container-image-CI-CD-and-ghcr.io-i40sys-conventions.md
parent_task_id: TASK-068
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Write `backlog/decisions/decision-022` recording the choice to re-externalize the `oriolrius.netmaker` Ansible collection from the monorepo and adopt the **existing** `github.com/oriolrius/netmaker-ansible-automation` repo as the single canonical source.

Mirror the structure/quality of `decision-021` (Context / Decision / Consequences / Alternatives / Status). It must capture:
- **Context:** the collection was consolidated into the monorepo by `decision-012`, which itself flagged the in-repo CI as "mislocated" (open-question) because `ansible/netmaker/.github/workflows/publish-collection.yml` can't run without a per-subproject remote — publishing went MANUAL. `decision-013` carried the same open item.
- **Decision:** adopt the existing oriolrius repo (NOT a transfer to i40sys, NOT a fresh repo); Galaxy namespace stays `oriolrius`; the monorepo keeps **no** Ansible collection source; reconcile-then-delete.
- **Why not i40sys:** the live `oriolrius/...` repo already publishes to the `oriolrius.netmaker` Galaxy namespace; a transfer would add risk (token re-point, redirect) for cosmetic org-consistency, and the Galaxy namespace would remain `oriolrius` regardless.
- **Consequences:** restores automated Galaxy publishing (CI lives where it can run again); `iotgw-ng` no longer carries Ansible source; Kestra continues to consume `oriolrius.netmaker` from Galaxy by FQCN (no runtime change); the `decision-012`/`decision-013` mislocated-CI open-question is **resolved**.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 decision-022 exists in backlog/decisions/ following the project ADR format (Context/Decision/Consequences/Alternatives/Status=Accepted), dated 2026-06-25.
- [x] #2 It explicitly resolves the 'mislocated CI / manual publish' open-question raised in decision-012 and decision-013, and those two ADRs get a forward-pointer note to decision-022.
- [x] #3 It states the canonical repo (oriolrius/netmaker-ansible-automation), the unchanged Galaxy namespace (oriolrius), and the reconcile-then-delete sequence, and is cross-linked from the epic.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.** Wrote `backlog/decisions/decision-022` (status: accepted, 2026-06-25) in the project ADR format (Context / Decision / Consequences). It records adopting the existing `github.com/oriolrius/netmaker-ansible-automation` as canonical (Galaxy namespace stays `oriolrius`), the reconcile-then-delete sequence, and why not i40sys. Added forward-pointer "Resolved" notes to `decision-012` (Q2) and `decision-013` (answer 2) marking the mislocated-CI open question resolved by decision-022. Cross-linked from the epic.
<!-- SECTION:NOTES:END -->
