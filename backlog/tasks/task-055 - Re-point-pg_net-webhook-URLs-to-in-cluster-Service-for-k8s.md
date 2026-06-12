---
id: TASK-055
title: Re-point pg_net webhook URLs to in-cluster Service for k8s
status: To Do
assignee: []
created_date: '2026-06-12 22:15'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The devices/networks pg_net webhook triggers stored in the DB POST to http://wsl.ymbihq.local:8000/functions/v1/netmaker-call. Under k8s, re-run the webhook migrations so they target the in-cluster Kong/functions Service URL. See decision-015 and iotgw-ui/supabase/migrations/20260610000000/01.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 webhook trigger URLs parameterized/re-pointed for the cluster
<!-- AC:END -->
