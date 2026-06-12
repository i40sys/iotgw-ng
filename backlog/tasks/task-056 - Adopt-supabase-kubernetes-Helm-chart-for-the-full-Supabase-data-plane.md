---
id: TASK-056
title: Adopt supabase-kubernetes Helm chart for the full Supabase data plane
status: To Do
assignee: []
created_date: '2026-06-12 22:15'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
deploy/ hand-migrates the core (db, kong/auth/rest/meta/functions authored). For the full data plane (realtime/storage/imgproxy/analytics/supavisor/vector) adopt the supabase-kubernetes community Helm chart fed from the SOPS store; keep kms/kestra/ingress from this tree. See decision-015.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Helm values sourced from secrets/ via secrets.sh k8s
- [ ] #2 full stack reachable in kind
<!-- AC:END -->
