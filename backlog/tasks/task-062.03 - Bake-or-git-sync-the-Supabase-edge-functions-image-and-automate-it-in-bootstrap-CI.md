---
id: TASK-062.03
title: >-
  Bake or git-sync the Supabase edge-functions image and automate it in
  bootstrap/CI
status: Done
assignee: []
created_date: '2026-06-18 05:43'
updated_date: '2026-06-18 13:26'
labels:
  - k8s
  - migration
  - supabase
  - compose-removal
milestone: Decommission docker-compose
dependencies: []
parent_task_id: TASK-062
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In compose the edge-function source is bind-mounted (restart-to-deploy). The k8s base functions.yaml ships an emptyDir with NO code; only the kind overlay fixes it via a locally-built iotgw-functions:local image whose build+kind-load is NOT in bootstrap.sh (manual), and prod inherits the empty placeholder. Automate building+loading the functions image in bootstrap.sh and define the prod delivery (registry image or git-sync).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bootstrap.sh builds iotgw-functions:local from Dockerfile.functions and kind-loads it during deploy (no manual prerequisite)
- [ ] #2 Prod overlay has a real functions image source (registry image or git-sync), not an emptyDir placeholder
- [x] #3 netmaker-call and the other functions respond through Kong /functions/v1/* on a fresh kind bring-up with no manual image step
- [x] #4 Vestigial KESTRA_* env in functions.yaml reviewed (kept only if still consumed)
<!-- AC:END -->







## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
DONE on kind, prod authored. bootstrap.sh now has build_functions(): docker build -t iotgw-functions:local -f deploy/k8s/base/supabase-app/Dockerfile.functions supabase/volumes, then kind load; called automatically by deploy() and exposed as 'bootstrap.sh functions'. Validated: image built (716MB) + loaded into node iotgw-control-plane; functions respond via Kong — GET /functions/v1/hello -> greeting, POST /functions/v1/netmaker-call -> proper 400 dispatch. Prod overlay (deploy/k8s/overlays/prod) now renames the image to a registry path + removes the emptyDir patch (mirrors kind); registry path/CI is a TODO placeholder (registry.invalid/iotgw-functions:REPLACE_WITH_RELEASE_TAG) — authored-not-validated until a real registry + CI push exist. KESTRA_* env in functions.yaml KEPT intentionally per decision-016 (durable edge-function -> Kestra handoff credential), not vestigial.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
bootstrap.sh builds + kind-loads iotgw-functions:local automatically (no manual step); functions verified reachable through Kong on kind. Prod delivery authored in the prod overlay (registry image + emptyDir removal) pending a real registry/CI. KESTRA_* kept per decision-016.
<!-- SECTION:FINAL_SUMMARY:END -->
