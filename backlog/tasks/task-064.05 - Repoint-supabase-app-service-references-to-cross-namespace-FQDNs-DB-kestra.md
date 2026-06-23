---
id: TASK-064.05
title: 'Repoint supabase-app service references to cross-namespace FQDNs (DB, kestra)'
status: Done
assignee: []
created_date: '2026-06-23 04:53'
updated_date: '2026-06-23 05:34'
labels:
  - service-dns
  - supabase-app
milestone: Namespace-per-subproject split
dependencies:
  - TASK-064.03
modified_files:
  - deploy/k8s/base/supabase-app/auth.yaml
  - deploy/k8s/base/supabase-app/rest.yaml
  - deploy/k8s/base/supabase-app/meta.yaml
  - deploy/k8s/base/supabase-app/functions.yaml
parent_task_id: TASK-064
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In deploy/k8s/base/supabase-app, change the genuinely cross-namespace short names to FQDNs while leaving intra-namespace short names (kong<->auth/rest/functions, auth->kong) untouched. Specifically: auth.yaml:41 GOTRUE_DB_DATABASE_URL ->supabase-db.supabase-db.svc.cluster.local:5432; rest.yaml:38 PGRST_DB_URI ->supabase-db.supabase-db...:5432; meta.yaml:30 PG_META_DB_HOST ->supabase-db.supabase-db.svc.cluster.local; functions.yaml:54 SUPABASE_DB_URL ->supabase-db.supabase-db...:5432; functions.yaml:70 KESTRA_BASE_URL ->kestra.kestra.svc.cluster.local:8080. Leave functions.yaml:37 SUPABASE_URL=http://kong:8000 and auth.yaml:32 API_EXTERNAL_URL=http://kong:8000 as short names (kong is in supabase-app). Leave kong.yaml auth/rest/functions upstreams as short names.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All four DB connection strings (auth/rest/meta/functions) use the supabase-db.supabase-db FQDN
- [x] #2 functions KESTRA_BASE_URL uses kestra.kestra FQDN
- [x] #3 kong upstreams and the kong-facing SUPABASE_URL/API_EXTERNAL_URL remain short names (no over-rewrite)
- [x] #4 kustomize build still renders and no same-namespace ref was needlessly FQDN-rewritten
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Edit exactly the 5 cross-ns env values; leave the 6 intra-ns refs alone; diff-review to enforce the short-vs-FQDN distinction.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
auth/rest/meta/functions DB URIs -> supabase-db.supabase-db FQDN; functions KESTRA_BASE_URL -> kestra.kestra FQDN. Intra-ns kong refs (API_EXTERNAL_URL, functions SUPABASE_URL, kong upstreams) correctly LEFT short. Live: auth/rest/meta/functions Running & serving via kong.
<!-- SECTION:NOTES:END -->
