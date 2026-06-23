---
id: TASK-065
title: >-
  Fix DownloadFiles->PodCreate leading-slash path bug blocking Ansible runner
  pods
status: To Do
assignee: []
created_date: '2026-06-23 05:50'
labels:
  - kestra
  - bug
  - k8s
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pre-existing bug (independent of the namespace split, surfaced during task-064.07 validation): triggering the connectivity-check/install/provisioning flows fails at the PodCreate task before the runner pod is created. io.kestra.plugin.kubernetes.core.PodCreate.run() -> PluginUtilsService.createInputFiles() rejects inputFiles map keys with a leading '/' (e.g. '/tasks/partitions.yaml') emitted by the DownloadFiles stage_namespace_files output. So no Ansible runner pod is spawned. Present in both the old iotgw and new kestra namespaces. The k8s routing/RBAC is correct (kestra SA -> kestra-pod-runner Role in the kestra ns; NetworkPolicy admits managed-by=kestra pods to the KMS) — only the inputFiles path needs fixing (strip leading '/', or fix the DownloadFiles->PodCreate handoff).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Triggering connectivity-check spawns a managed-by=kestra runner pod in the kestra namespace (no leading-slash path error)
- [ ] #2 install + provisioning flows likewise reach pod creation
- [ ] #3 A runner pod fetches a device SSH key from cosmian-kms.kms over the FQDN (NetworkPolicy permits it)
<!-- AC:END -->
