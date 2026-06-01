---
id: TASK-042
milestone: CRUD networks
parent_task_id: TASK-052
title: Add DELETE webhook trigger for networks table
status: To Do
assignee: []
created_date: '2026-04-22 05:05'
labels:
  - networks
  - supabase
  - database
  - migration
dependencies: []
references:
  - iotgw-ui/supabase/migrations/20260114000000_add_devices_delete_webhook.sql
  - iotgw-ui/supabase/migrations/20251117000301_create_networks_webhook.sql
  - backlog/docs/doc-016 - Kestra-Notification-Automation-Pattern.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mirror the devices DELETE webhook (migration 20260114000000_add_devices_delete_webhook.sql) for the networks table so that deleting a network in Supabase actually triggers the Kestra workflow that removes the network from Netmaker.

## Background
Verified gap: today the only network webhook is the INSERT/UPDATE trigger created in iotgw-ui/supabase/migrations/20251117000301_create_networks_webhook.sql. There is NO DELETE trigger. Deleting a network row removes it from Supabase but the Netmaker network is orphaned. Devices got a parallel DELETE trigger in 2026-01; networks did not.

## Implementation
Create iotgw-ui/supabase/migrations/<ts>_add_networks_delete_webhook.sql that:
1. drop trigger if exists networks_webhook_delete on public.networks;
2. create trigger networks_webhook_delete after delete on public.networks for each row execute function supabase_functions.http_request('http://wsl.ymbihq.local:8000/functions/v1/kestra-call', 'POST', '{"Content-Type":"application/json"}', '{}', '5000');
3. Leave the existing networks_webhook (INSERT/UPDATE) trigger untouched.

Pattern to mirror: iotgw-ui/supabase/migrations/20260114000000_add_devices_delete_webhook.sql
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 New migration file present and idempotent (drop trigger if exists)
- [ ] #2 networks_webhook_delete trigger created on AFTER DELETE FOR EACH ROW
- [ ] #3 Existing networks_webhook (INSERT/UPDATE) trigger from 20251117000301 is untouched
- [ ] #4 pnpm db:reset (or pnpm db:reset:full) succeeds without errors
- [ ] #5 Deleting a network row in Supabase Studio produces a network_jobs row with flow_id='networks' and a Kestra execution is observed
<!-- AC:END -->
