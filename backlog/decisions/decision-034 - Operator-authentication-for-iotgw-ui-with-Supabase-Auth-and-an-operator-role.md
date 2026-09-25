---
id: decision-034
title: '034: Operator authentication for iotgw-ui with Supabase Auth and an operator role'
date: '2026-09-25 21:00'
status: accepted
---
## Context

The iotgw-ui backend (Fastify + tRPC, `iotgw-ui` namespace) has **no user
authentication**: every procedure — devices, deployments, SSH enrollment reset,
and since decision-033 `getDeviceCode` / `rotateDeviceCode` — answers anyone who
can reach `iotgw-ui-backend.wsl.ymbihq.local` or NodePort 4444. decision-033
assumes the operator gets device codes through a **trusted, authenticated UI**
(task-136). The stack already runs Supabase Auth (GoTrue) behind Kong, but with
`GOTRUE_DISABLE_SIGNUP=false`, so "any authenticated Supabase user" would mean
anyone who signs up.

## Decision

1. **Identity provider: the existing Supabase Auth (GoTrue).** No new service.
   Email + password operators; sessions are GoTrue JWTs (HS256, `JWT_SECRET`).
2. **Sign-up is disabled** (`GOTRUE_DISABLE_SIGNUP=true`). Operators are created
   by an administrator only, with the GoTrue admin API (service role), through
   `scripts/operators/create-operator.sh` (`just operator-create`).
3. **Authorization = an operator role in `app_metadata`**
   (`app_metadata.iotgw_role ∈ {operator, admin}`), which only the service role can
   set — a user cannot grant it to themselves.
4. **Backend:** a tRPC middleware verifies the bearer JWT (signature, expiry,
   `aud=authenticated`) and the role on **every** procedure (HTTP and WebSocket —
   the WS client sends the token in `connectionParams`); otherwise `UNAUTHORIZED`
   / `FORBIDDEN`. The operator's email and id are in the context and are logged
   for sensitive actions (device codes, rotation, SSH enrollment reset, deploy).
5. **UI:** a login page (supabase-js, anon key); the session token is attached
   to every tRPC call; sign-out; unauthenticated users are redirected to login.
6. **Internal endpoints** (`/internal/*`, bearer-token service calls from Kestra
   and the edge functions) keep their bearer tokens and are **refused when they
   arrive through the public ingress** (ingress-nginx adds `X-Forwarded-For`;
   in-cluster callers do not).

## Consequences

- decision-033's trusted-UI precondition holds; getDeviceCode is operator-only
  and audit-logged.
- `just e2e` (backend HTTP + Playwright) authenticates as a dedicated test operator
  created by the recipe; credentials come from SOPS, never from source.
- Rejected: Keycloak OIDC for operators (the realm exists for pki-manager, but it
  adds a second IdP to operate and a client to register for no gain here).
