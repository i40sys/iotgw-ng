---
id: TASK-147
title: Rotate the Cloudflare API token for i40sys.com
status: To Do
assignee: []
created_date: '2026-09-29 10:37'
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
- [ ] #1 New token scoped to Zone:DNS:Edit on i40sys.com only
- [ ] #2 Old token revoked in Cloudflare
- [ ] #3 secrets/ovh.enc.env updated (sops set) and tf.sh infra plan shows no changes
- [ ] #4 New token stored in Bitwarden, never pasted in chat
<!-- AC:END -->
