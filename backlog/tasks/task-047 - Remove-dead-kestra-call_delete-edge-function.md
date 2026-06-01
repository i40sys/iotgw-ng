---
id: TASK-047
milestone: CRUD networks
parent_task_id: TASK-052
title: Remove dead kestra-call_delete edge function
status: To Do
assignee: []
created_date: '2026-04-22 05:06'
labels:
  - supabase
  - edge-function
  - cleanup
dependencies:
  - TASK-043
references:
  - supabase/volumes/functions/kestra-call_delete/index.ts
  - supabase/volumes/functions/CLAUDE.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
supabase/volumes/functions/kestra-call_delete/index.ts is unreferenced. Verified: no migration calls /functions/v1/kestra-call_delete; both INSERT and DELETE webhooks point to /functions/v1/kestra-call. The function duplicates ~half of kestra-call.

## Change
- Delete the directory supabase/volumes/functions/kestra-call_delete/
- Update supabase/volumes/functions/CLAUDE.md to drop the reference
- If task-051 reveals a delete edge case that the unified function can't handle, revisit (but default is delete)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Directory supabase/volumes/functions/kestra-call_delete/ removed
- [ ] #2 Kong / docker-compose config has no reference to kestra-call_delete
- [ ] #3 supabase/volumes/functions/CLAUDE.md updated
- [ ] #4 Verification: grep -r kestra-call_delete returns no hits in supabase/ and iotgw-ui/
<!-- AC:END -->
