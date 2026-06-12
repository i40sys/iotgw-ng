---
id: TASK-057
title: Add authentication + NetworkPolicy to Cosmian KMS
status: To Do
assignee: []
created_date: '2026-06-12 22:15'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
KMS runs with NO auth and NO TLS while holding all device SSH private keys. For any non-local environment add a kms.toml [authentication] block (JWT/OIDC) and a k8s NetworkPolicy restricting :9998 to Kestra/edge-function pods. See decision-015 k8s notes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 KMS requires auth
- [ ] #2 NetworkPolicy restricts access
<!-- AC:END -->
