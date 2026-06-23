---
id: TASK-064.01
title: Author ADR decision-020 ratifying the namespace-per-subproject topology
status: Done
assignee: []
created_date: '2026-06-23 04:53'
updated_date: '2026-06-23 05:34'
labels:
  - adr
  - docs
milestone: Namespace-per-subproject split
dependencies: []
modified_files:
  - backlog/decisions/decision-020 - Namespace-per-subproject-topology.md
parent_task_id: TASK-064
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Write decision-020 in backlog/decisions/ ratifying that the kind cluster `iotgw` keeps its name while the `iotgw` NAMESPACE is eliminated in favor of one namespace per subproject (kestra, kms, supabase-db, supabase-app, iotgw-ui), following the Headlamp pattern (decision-019/doc-017) of per-subproject kustomizations with their own namespace transformers and no global transformer. Record the cross-namespace FQDN convention, the namespaceSelector label convention (`kubernetes.io/metadata.name`), the whoami decision, and reference decision-015 (KMS hardening) and doc-017 as the reference pattern.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 decision-020 file exists in backlog/decisions/ with status Accepted and lists the 5 target namespaces plus the untouched headlamp/ingress-nginx
- [x] #2 ADR explicitly states the kind cluster name and kube-context `kind-iotgw` and the Keycloak `iotgw` realm are unchanged
- [x] #3 ADR fixes the namespaceSelector label key convention (`kubernetes.io/metadata.name`) and the FQDN form for cross-namespace calls
- [x] #4 ADR records the whoami fate decision and references decision-015 and doc-017
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use the Backlog.md/decision template under backlog/decisions/. Cite the discovery findings; cross-link decision-015, decision-019, doc-017, task-057.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
decision-020 authored (backlog/decisions/): 5 target namespaces, cluster/context/realm iotgw preserved, FQDN + kubernetes.io/metadata.name conventions, whoami fate recorded.
<!-- SECTION:NOTES:END -->
