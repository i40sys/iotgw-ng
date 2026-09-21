---
id: TASK-076
title: 'pki-manager: un-shadow the zone-scoped public SSH trust routes'
status: Done
assignee: []
created_date: '2026-09-14 05:29'
updated_date: '2026-09-21 04:38'
labels:
  - ssh-ca
  - pki-manager
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Verified on pki.joor.net 2026-09-14: `GET /ssh/zones/<zone>/{host-ca-keys,cert-authority,trusted-user-ca-keys}` all return the SPA's `index.html`, while the **unscoped** equivalents (`/ssh/trusted-user-ca-keys`, `/ssh/host-ca-keys`, `/ssh/cert-authority`) work and serve the **default** zone. The fix belongs in the pki-manager repo: the SPA fallback must exclude `/ssh/*`.

**Why it matters concretely.** With both routes unusable for a per-domain zone, there is no anonymous way for a host or an operator to fetch its own zone's trust anchors. Two things currently work around it:
- `supabase/volumes/functions/_shared/pki-manager.ts` reads `GET /ssh/cas/:id/ca.pub` instead — public and **id-addressed**, so inherently zone-correct, with the ids coming from `domains.pki_user_ca_id` / `pki_host_ca_id`.
- `scripts/ssh-ca/trust.sh` does the same for the operator side.

Both are fine and can stay, but note what is still missing: there is **no zone-scoped way to get a combined `TrustedUserCAKeys` file covering an `active` + `rotating` CA pair**. `ca.pub` returns one CA. That makes CA rotation (decision-028 §4) awkward until this is fixed, because a rotating gateway needs the union of both anchors.

Also verified: a **fleet token cannot** read `/api/v1/ssh/trust-anchors` (401) — that route is OIDC-only — so "just use the authenticated API from the edge function" is not an alternative.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 GET /ssh/zones/<zone>/host-ca-keys returns an OpenSSH public key, not HTML
- [x] #2 GET /ssh/zones/<zone>/cert-authority?pattern=... returns an @cert-authority line
- [x] #3 GET /ssh/zones/<zone>/trusted-user-ca-keys returns the zone's user CA keys, including a rotating CA when one exists
- [x] #4 The unscoped legacy routes still serve the default zone unchanged, so already-enrolled hosts do not break
- [x] #5 iotgw-ng's ca.pub workaround is either retired or documented as a deliberate choice now that the scoped routes work
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Root cause (pki-manager-web repo, docker/nginx.conf):** the single-origin edge proxy only allowlisted the UNSCOPED trust paths to backend:3000; `/ssh/zones/<zone>/...` fell through to the SPA `location /` and returned index.html. Backend routes already existed (ssh-public.routes.ts:211-238) but were unreachable.

**Fix:** added `location ~ ^/ssh/zones/[^/]+/(host-ca-keys|trusted-user-ca-keys|cert-authority)$` → backend, before the SPA fallback. Commit oriolrius/pki-manager-web 6c25085; released v3.12.1; deployed on y0 `/opt/stacks/pki` (frontend+backend → 3.12.1).

**Live proof (pki.joor.net, zone iotgw-ssh-ca-test):**
- AC#1 `/ssh/zones/<z>/host-ca-keys` → 200 text/plain OpenSSH key (was text/html)
- AC#2 `/ssh/zones/<z>/cert-authority?pattern=*.warehouse.iotgw` → `@cert-authority *.warehouse.iotgw ecdsa-...`
- AC#3 `/ssh/zones/<z>/trusted-user-ca-keys` → 200 user CA key. Rotating inclusion is code-guaranteed: getTrustAnchors() (ssh-ca.service.ts:215) emits every CA with status active|rotating. Live active+rotating pair demo tracked under task-103 AC#3.
- AC#4 legacy unscoped `/ssh/host-ca-keys` still 200 (default zone); `/ssh/cas` UI still SPA.

**AC#5 (open):** iotgw-ng's `ca.pub` workaround (`_shared/pki-manager.ts`, `scripts/ssh-ca/trust.sh`) — decide retire vs document as deliberate now that scoped routes work.

**AC#5 DONE 2026-09-21 — consumers repointed off the one-CA ca.pub route onto the zone-scoped routes (task-103 AC#3 last mile):**
- `supabase/volumes/functions/_shared/pki-manager.ts`: added `zoneTrustAnchors(cfg, zone)` → GETs `/ssh/zones/<zone>/{trusted-user-ca-keys,host-ca-keys}`, returns the ACTIVE+ROTATING set of each type (arrays). `caPublicKey` kept for genuine single-CA-by-id callers.
- `supabase/volumes/functions/ssh-ca/index.ts` (the enrolment/trust bridge): now calls `zoneTrustAnchors(pki, domain.pki_zone)` instead of two `caPublicKey(id)` calls; `payload.user_ca`/`host_ca` carry the full pair; `cert_authority` emits one @cert-authority line per Host CA. deno check clean (the 2 remaining errors are pre-existing latest-Deno lib-strictness issues in _shared/device-auth.ts, untouched).
- `scripts/ssh-ca/trust.sh`: fetches `/ssh/zones/<zone>/cert-authority?pattern=*.<domain>.iotgw` (multi-line, one per Host CA); domain→zone map from `domains.pki_zone`; env renamed `DOMAIN_CA_MAP`→`DOMAIN_ZONE_MAP`. Live-tested against pki.joor.net. README updated.

The single-anchor `ca.pub` limitation is retired for trust material; a gateway/operator now receives the whole CA pair over a rotation overlap.
<!-- SECTION:NOTES:END -->
