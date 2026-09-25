---
id: TASK-136
title: Authenticate iotgw-ui operators (backend + UI) — precondition of decision-033
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 18:02'
updated_date: '2026-09-25 22:12'
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
- [x] #1 Every tRPC procedure requires an authenticated operator (401 otherwise)
- [x] #2 getDeviceCode/rotateDeviceCode are audit-logged with the operator identity
- [x] #3 Internal /internal/* endpoints keep their bearer tokens and are not reachable through the public ingress
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done — decision-034 (commit 2e5e4bc).** Supabase Auth operators with app_metadata.iotgw_role ∈ {operator, admin}; GOTRUE_DISABLE_SIGNUP=true; `just operator-create`.
- Backend: every tRPC procedure (HTTP + WS connectionParams) verifies the GoTrue JWT (JWT_SECRET) + role → 401/403; audit log (operator email) on getDeviceCode, rotateDeviceCode, resetSshEnrollment, executeKestraDeployment, device create/delete.
- /internal/* refused (403) when it arrives through the ingress (X-Forwarded-For); in-cluster callers unchanged.
- UI: /login, token on every call, sign-out, redirect on 401/403.
- Verified on kind: no token/forged → 401; user without role → 403 (even after writing user_metadata); signup → 422 signup_disabled; `just e2e` 10/10 signs in; UI login via orca.
- Credentials: SOPS secrets/iotgw-ui-backend.enc.env (OWNER_OPERATOR_PASSWORD for finances@ymbi.eu; E2E_OPERATOR_*).
- Note: the backend NodePort (4444) is not host-mapped on this cluster; if it ever is, /internal would bypass the ingress guard (bearer still required).
<!-- SECTION:NOTES:END -->
