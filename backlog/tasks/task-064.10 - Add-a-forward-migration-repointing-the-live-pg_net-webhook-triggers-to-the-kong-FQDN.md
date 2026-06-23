---
id: TASK-064.10
title: >-
  Add a forward migration repointing the live pg_net webhook triggers to the
  kong FQDN
status: Done
assignee: []
created_date: '2026-06-23 04:53'
updated_date: '2026-06-23 05:34'
labels:
  - migration
  - db-webhook
  - service-dns
milestone: Namespace-per-subproject split
dependencies:
  - TASK-064.05
modified_files:
  - >-
    iotgw-ui/supabase/migrations/20260610000000_repoint_devices_webhook_to_netmaker.sql
  - >-
    iotgw-ui/supabase/migrations/20260610000001_repoint_networks_webhook_to_netmaker.sql
  - iotgw-ui/supabase/migrations/20260618000000_create_deployments_webhook.sql
  - >-
    iotgw-ui/supabase/migrations/20260623000000_repoint_webhooks_to_kong_fqdn.sql
parent_task_id: TASK-064
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The webhook URL http://kong:8000/functions/v1/... is compiled into live Postgres TRIGGER rows inside supabase-db; pg_net executes from the supabase-db pod, where `kong:8000` no longer resolves post-split. Two parts: (1) edit the migration FILES so fresh bring-ups are correct — 20260610000000_repoint_devices_webhook_to_netmaker.sql (lines 19,32), 20260610000001_repoint_networks_webhook_to_netmaker.sql (lines 25,38), 20260618000000_create_deployments_webhook.sql (line 19) ->http://kong.supabase-app.svc.cluster.local:8000/...; (2) add a NEW forward migration that drops+recreates the already-installed triggers with the kong.supabase-app FQDN so existing clusters are repointed (changing files alone is a no-op when the schema already exists). Also repoint any Kestra-flow PostgREST write-back URL (PATCH deployment_jobs via http://kong:8000/rest/v1) in the synced flow YAML to the kong.supabase-app FQDN.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The three existing migration files use the kong.supabase-app FQDN
- [x] #2 A new dated forward migration repoints the live device/network/deployment webhook triggers to the kong.supabase-app FQDN
- [x] #3 After applying, a device INSERT fires net.http_post to kong.supabase-app and the netmaker-call function is reached (job row transitions PENDING->SUCCESS/FAILED)
- [x] #4 Any hardcoded kong:8000 PostgREST write-back in synced Kestra flows is repointed and re-synced
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Edit 3 migration files; add a new forward migration with drop/create trigger; check the kestra flow write-back URL; validate the webhook fires post-cutover.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
3 existing migration files repointed kong:8000 -> kong.supabase-app FQDN; NEW forward migration 20260623000000_repoint_webhooks_to_kong_fqdn.sql drops+recreates all 5 live triggers with the FQDN. LIVE VALIDATED: pg_get_triggerdef shows kong.supabase-app for devices/networks/deployments webhooks; pg_net fire assertion PASS (HTTP 202 + *_jobs).
<!-- SECTION:NOTES:END -->
