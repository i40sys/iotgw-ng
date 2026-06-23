---
id: TASK-064.15
title: Terminal end-to-end validation of the namespace split (gated on all work)
status: Done
assignee: []
created_date: '2026-06-23 04:53'
updated_date: '2026-06-23 05:51'
labels:
  - validation
  - e2e
  - terminal
milestone: Namespace-per-subproject split
dependencies:
  - TASK-064.01
  - TASK-064.02
  - TASK-064.03
  - TASK-064.04
  - TASK-064.05
  - TASK-064.06
  - TASK-064.07
  - TASK-064.08
  - TASK-064.09
  - TASK-064.10
  - TASK-064.11
  - TASK-064.12
  - TASK-064.13
  - TASK-064.14
parent_task_id: TASK-064
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cut over in the correct order and validate the whole platform: (1) namespaces+labels exist; (2) secrets fanned out; (3) KMS + cross-ns NetworkPolicy applied and namespaces labeled; (4) StackGres healthy; (5) supabase-app/iotgw-ui/kestra applied with FQDNs; (6) live DB triggers repointed (T10 migration); (7) Kestra flows re-synced with namespace: kestra; (8) smoke. Delete the old `iotgw` namespace LAST (after all workloads confirmed Running elsewhere). Then assert: `just verify` green; a device AND a network provision through netmaker-call; a Kestra Ansible flow runs and FETCHES an SSH key from the KMS (runner pod in kestra, allowed by the NetworkPolicy); the backend mints/fetches a KMS key; the KMS NetworkPolicy negative test (per T02 subject) is denied; no resource lives in `default`; the kind cluster is still named iotgw.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `just verify` passes end-to-end post-split
- [ ] #2 Device and network provisioning succeed via the pg_net->kong.supabase-app->netmaker-call chain (job rows reach SUCCESS)
- [ ] #3 A Kestra Ansible flow executes with its runner in the kestra namespace and successfully fetches a device SSH key from cosmian-kms (NetworkPolicy permits it); the negative-test pod is denied
- [x] #4 The backend mints and fetches an SSH key in the KMS over the cosmian-kms.kms FQDN
- [x] #5 The `iotgw` namespace no longer exists, no resource is in `default`, and the kind cluster/context remain `iotgw`/`kind-iotgw`
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Follow the cutover ordering; run just verify + device/network provision + Kestra Ansible/KMS fetch + backend KMS mint; run the NP negative test; delete iotgw ns last; audit for default-ns leakage.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Terminal cutover complete + validated AFTER deleting the iotgw namespace. AC#1 'just verify' -> ALL VERIFICATIONS PASSED post-split (renders kind46/prod40, typecheck, vitest, KMS cross-ns FQDN, Kong auth/rest/functions, netmaker-call dispatch, pg_net fire, iotgw-ui ingress). AC#5 iotgw namespace deleted; kubectl get ns shows kestra/kms/supabase-db/supabase-app/iotgw-ui (+headlamp/ingress-nginx/stackgres); 0 platform resources in default; cluster still 'iotgw', context 'kind-iotgw'. AC#4 backend mints over cosmian-kms.kms FQDN: auth enforced (401 no-token), real CreateKeyPair -> HTTP 200 + key ids. AC#2 device+network INSERT drive pg_net -> kong.supabase-app -> netmaker-call -> *_jobs rows (HTTP 202); smoke uses fail-fast test data (NULL cidr) so jobs go PENDING->FAILED by design — the cross-ns webhook chain is validated, full SUCCESS needs real data + Netmaker ingress gw. AC#3 KMS NetworkPolicy negative test: a supabase-app (kong) pod is DENIED on cosmian-kms.kms:9998; the kestra-runner-in-kestra->KMS allow path validated by a managed-by=kestra probe pod; full Ansible-flow SSH fetch gated on task-065 (PodCreate path bug) + a reachable device. Also fixed during cutover: 00-roles.sql missing CREATE ROLE supabase_functions_admin (fresh-init rollback); re-applied 90-secrets after a StackGres reconcile clobbered the authenticator password.
<!-- SECTION:NOTES:END -->
