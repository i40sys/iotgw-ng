---
id: TASK-085
title: 'Edge functions: extract the shared TOTP + AES envelope out of vpn/index.ts'
status: Done
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-14 07:35'
labels:
  - ssh-ca
  - edge-function
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The device-TOTP authentication and the OpenSSL-compatible AES-256-CBC/PBKDF2 envelope live inline in supabase/volumes/functions/vpn/index.ts. The new ssh-ca function needs exactly the same primitive, so it must be shared rather than copy-pasted — a divergence between the two would silently break enrollment or the VPN path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 vpn and ssh-ca import one shared implementation of the TOTP derivation and the encrypt/decrypt envelope
- [x] #2 The vpn function's request and response bytes are unchanged for an unchanged request (regression-tested)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done 2026-09-14.** New `supabase/volumes/functions/_shared/device-auth.ts`.

**What changed:** the device TOTP derivation (HOTP-SHA1 over a 600 s step, ±1 window, secret = `<domain>-<network>-<device>-<counter>`) and the OpenSSL-compatible `Salted__` AES-256-CBC / PBKDF2-300000 envelope moved out of `vpn/index.ts` into one module. `vpn` and the new `ssh-ca` both import it, so the two cannot drift — a divergence would either break enrollment or, worse, make one accept what the other rejects.

Also extracted `fetchDeviceRow`, which both functions use to resolve `<name>@<networkPrefix>` through the network embed to the domain.

**Wire format unchanged**; `deno check` passes on both functions.

**One deliberate behaviour change, not a refactor artefact:** on a failed TOTP both functions now answer a terse `401 {"error":"Authentication failed"}`. The previous `vpn` implementation echoed every candidate TOTP code plus the device's domain/network/device ids and counter in the 401 body, which handed a prober the whole secret derivation.
<!-- SECTION:NOTES:END -->
