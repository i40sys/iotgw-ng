---
id: TASK-062.06
title: Restore Kestra Gemini AI config and management-port parity in k8s
status: Done
assignee: []
created_date: '2026-06-18 05:43'
updated_date: '2026-06-18 18:43'
labels:
  - k8s
  - migration
  - kestra
dependencies:
  - TASK-062.05
parent_task_id: TASK-062
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The k8s KESTRA_CONFIGURATION omits the kestra.ai gemini block and never injects KESTRA_GEMINI_API_KEY (the key exists in the kestra-env Secret). Restore the AI config and inject the key; configure tasks.tmpDir/working-dir parity; decide whether to expose the 8081 management/health port via the Service.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 kestra.ai gemini config restored in KESTRA_CONFIGURATION and KESTRA_GEMINI_API_KEY injected from the kestra-env Secret
- [x] #2 tasks.tmpDir / working dir configured equivalently to compose
- [x] #3 8081 management port decision recorded (exposed or intentionally probes-only)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inject KESTRA_GEMINI_API_KEY from kestra-env Secret.\n2. Restore kestra.ai gemini block + tasks.tmpDir in KESTRA_CONFIGURATION (compose parity); mount a tmp emptyDir.\n3. Record the 8081 mgmt-port decision (probes-only).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done & validated live. AC#1: KESTRA_CONFIGURATION now carries the kestra.ai gemini block (type: gemini, model-name: gemini-2.5-flash, api-key: ${KESTRA_GEMINI_API_KEY}) and the key is injected as an env var from the kestra-env Secret (verified in the running pod: len=39, non-empty; running $KESTRA_CONFIGURATION shows the ai block). AC#2: kestra.tasks.tmpDir.path=/tmp/kestra-wd/tmp restored (compose parity), backed by a new 'kestra-wd' emptyDir volumeMount (verified writable in-pod). AC#3: 8081 (Micronaut management/health) decision RECORDED in kestra.yaml — intentionally probes-only (liveness+readiness GET /health:8081), NOT published on the kestra Service/NodePort (nothing off-pod needs /health or /prometheus). Also refreshed the stale comment that said the Docker runner doesn't work -> now notes the PodCreate k8s runner + kestra SA (task-054). Rollout succeeded (probes pass); the 5 flows survived the restart (Postgres-backed).
<!-- SECTION:NOTES:END -->
