---
id: TASK-136
title: Authenticate iotgw-ui operators (backend + UI) — precondition of decision-033
status: To Do
assignee: []
created_date: '2026-09-25 18:02'
labels:
  - security
  - backend
  - frontend
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while validating decision-033 (2026-09-25): the iotgw-ui backend has NO user authentication — every tRPC procedure (incl. getDeviceCode / rotateDeviceCode, resetSshEnrollment, deployments) answers anyone who can reach iotgw-ui-backend (ingress hostname / NodePort 4444). decision-033 assumes the operator obtains codes through a TRUSTED UI; until operators authenticate (e.g. OIDC with the existing Keycloak realm `iotgw`, as the backend's PKI service account already uses), a device code is only as protected as network access to the backend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every tRPC procedure requires an authenticated operator (401 otherwise)
- [ ] #2 getDeviceCode/rotateDeviceCode are audit-logged with the operator identity
- [ ] #3 Internal /internal/* endpoints keep their bearer tokens and are not reachable through the public ingress
<!-- AC:END -->
