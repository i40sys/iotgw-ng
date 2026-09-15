---
id: TASK-076
title: 'pki-manager: un-shadow the zone-scoped public SSH trust routes'
status: To Do
assignee: []
created_date: '2026-09-14 05:29'
updated_date: '2026-09-14 07:35'
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
- [ ] #1 GET /ssh/zones/<zone>/host-ca-keys returns an OpenSSH public key, not HTML
- [ ] #2 GET /ssh/zones/<zone>/cert-authority?pattern=... returns an @cert-authority line
- [ ] #3 GET /ssh/zones/<zone>/trusted-user-ca-keys returns the zone's user CA keys, including a rotating CA when one exists
- [ ] #4 The unscoped legacy routes still serve the default zone unchanged, so already-enrolled hosts do not break
- [ ] #5 iotgw-ng's ca.pub workaround is either retired or documented as a deliberate choice now that the scoped routes work
<!-- AC:END -->
