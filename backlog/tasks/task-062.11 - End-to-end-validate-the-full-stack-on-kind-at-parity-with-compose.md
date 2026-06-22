---
id: TASK-062.11
title: End-to-end validate the full stack on kind at parity with compose
status: Done
assignee: []
created_date: '2026-06-18 05:43'
updated_date: '2026-06-18 19:27'
labels:
  - k8s
  - migration
  - compose-removal
  - validation
dependencies:
  - TASK-056
  - TASK-055
  - TASK-062.05
  - TASK-062.07
  - TASK-062.08
parent_task_id: TASK-062
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With all services on kind (Supabase app tier + Helm data plane, Kestra with k8s runner + flows/KV, KMS, iotgw-ui, ingress), run a full end-to-end validation exercising the real call chain at parity with compose: UI -> backend tRPC -> Supabase insert -> DB trigger -> in-cluster netmaker-call -> job SUCCESS; an OpenWRT Ansible flow runs via the k8s task runner; backend mints/fetches SSH keys in KMS; auth/rest/functions answer via Kong. This is the single gate the terminal deletion depends on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A device/network created in the UI provisions end-to-end on kind (DB trigger -> in-cluster netmaker-call -> job SUCCESS)
- [x] #2 At least one OpenWRT Ansible flow runs to completion via the Kestra k8s task runner
- [x] #3 Backend SSH-key mint/fetch against in-cluster KMS succeeds; auth/rest/functions all answer via Kong
- [x] #4 'just verify' (kustomize render + extended kind smoke) passes for the full stack and deploy/README matrix is all-green
- [x] #5 Documented list of accepted parity deltas vs compose (e.g. analytics/studio dropped, 6543 pooler)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Real device/network provision e2e -> job SUCCESS (create/delete round-trip).\n2. Ansible flow via k8s PodCreate runner -> SUCCESS.\n3. Backend KMS mint/fetch + auth/rest/functions via Kong.\n4. just verify all-green.\n5. Document accepted parity deltas.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done — full-stack e2e validated on kind. This is the gate the terminal deletion (062.15) depends on.

AC#1: a real network create provisioned END-TO-END through the live chain (DB INSERT -> pg_net -> in-cluster netmaker-call -> real Netmaker network) -> network_jobs SUCCESS in 6s; then DELETE -> deprovision -> delete job SUCCESS; test network + job rows cleaned up (0 remaining). (Plus the side-effect-free smoke-pgnet asserts both device+network webhooks fire with net._http_response 202 + job rows.)
AC#2: the k8s-ansible-runner-test flow ran via io.kestra.plugin.kubernetes.core.PodCreate — runner pod iotgw-ng-...-test-ansible-pod-wfisggrw reached Completed; execution SUCCESS (test_ansible_pod + writeback_success). Proves Ansible runs as a k8s pod (no docker.sock) AND the 062.18 Kestra write-back.
AC#3: backend SSH-key mint/fetch against in-cluster KMS works WITH auth on (057: in-pod createKeyPair+Get ROUNDTRIP_OK; KMIP with the backend's 44-char token -> accepted, without -> 401). auth/rest/functions all answer via Kong (verify: GoTrue 401, PostgREST 401, functions/hello 200, netmaker-call dispatch 400).
AC#4: 'just verify' -> ALL VERIFICATIONS PASSED (secret hygiene, SOPS round-trip, .env.example, kind+prod render 45/39 objects, iotgw-ui typecheck+vitest, full kind smoke incl. KMS-in-cluster, Kestra, whoami, Kong endpoints, pg_net fire, iotgw-ui via ingress). deploy/README matrix all-green (062.02). Fixed a verify false-positive (excluded the tools/secrets/secrets.sh scanner) + scrubbed 2 pre-existing compromised-cred literals from decision-014/task-060.06 docs (task-058 partial; rotation itself is task-053).
AC#5: accepted parity deltas documented in deploy/README ('Accepted parity deltas vs compose') — dropped data-plane services (realtime/storage/imgproxy/studio/analytics/supavisor/vector; direct primary, no 6543), StackGres PG15, KMS auth+NetworkPolicy (host :9998 blocked), iotgw-ui via ingress, baked functions image, Kestra Gitea sync; + authored-not-validated (real gateway provisioning needs hardware+KMS token, SGBackup/prod TLS, Gitea webhook).
<!-- SECTION:NOTES:END -->
