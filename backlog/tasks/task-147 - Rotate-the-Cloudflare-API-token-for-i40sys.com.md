---
id: TASK-147
title: Rotate the Cloudflare API token for i40sys.com
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 10:37'
updated_date: '2026-09-30 05:38'
labels:
  - security
  - ovh
  - dns
dependencies:
  - TASK-142
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Why.** The Zone:DNS:Edit token for `i40sys.com` was pasted into a chat session (2026-09-29, task-142), so it must be treated as exposed.

**Where it is used:** `secrets/ovh.enc.env` → `CLOUDFLARE_API_TOKEN`, read by `deploy/terraform/ovh/tf.sh infra` (records `iotgw|backend.iotgw|api.iotgw|device.iotgw.i40sys.com`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New token scoped to Zone:DNS:Edit on i40sys.com only
- [x] #2 Old token revoked in Cloudflare
- [x] #3 secrets/ovh.enc.env updated (sops set) and tf.sh infra plan shows no changes
- [x] #4 New token stored in Bitwarden, never pasted in chat
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Rotated (2026-09-30).**
- New **account** token (Bitwarden "Cloudflare i40sys.com DNS token (iotgw-ng)"), Zone:DNS:Edit on i40sys.com only, in `secrets/ovh.enc.env`; `tf.sh infra plan` = no changes.
- Old **user** token "Edit zone DNS" (id f90d6e36…, the one pasted in chat) deleted by the user in My Profile → API Tokens; the API now answers `Invalid API Token`.
- Note: both tokens were created the same day; the old one was the only user token (the new one lives under Account API Tokens).
<!-- SECTION:NOTES:END -->
