---
id: TASK-054
title: Migrate Kestra Ansible flows to the Kubernetes task runner
status: Done
assignee: []
created_date: '2026-06-12 22:15'
updated_date: '2026-06-18 18:20'
labels:
  - kestra
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In k8s the Docker task runner (host docker.sock, used by install/provisioning/connectivity flows running cytopia/ansible) does not work. Switch those flows to Kestra's Kubernetes task runner (PodCreate) or a DinD sidecar so Ansible executes as pods. See decision-015.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 install/provisioning/connectivity flows run Ansible as k8s pods (no docker.sock)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin to exact Kestra version (v1.3.22); verify the Kubernetes runner plugin id/property shape for that version.\n2. Rewrite install/provisioning/connectivity Ansible tasks off the Docker(docker.sock) runner onto the Kubernetes pod runner.\n3. Add Kestra ServiceAccount + Role/RoleBinding (pods create/log/exec) and wire serviceAccountName.\n4. Prove an Ansible task runs as a k8s pod.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (delegated to kestra-expert, verified). Migrated install/provisioning/connectivity-check off the Docker(docker.sock) task runner onto Kubernetes pods.

Version-exact finding: Kestra v1.3.22 — io.kestra.plugin.ansible.cli.AnsibleCLI.taskRunner only accepts Docker or Process; there is NO Kubernetes taskRunner registered (io.kestra.plugin.kubernetes v1.9.1 exposes no taskRunners), verified via GET /api/v1/plugins. So the migration replaces AnsibleCLI+Docker with io.kestra.plugin.kubernetes.core.PodCreate directly (cytopia/ansible image as the pod container), and the auto-namespaceFiles the Docker runner gave is replaced by an explicit io.kestra.plugin.core.namespace.DownloadFiles -> PodCreate inputFiles merge.

Files: kestra/data/main/iotgw-ng/_files/Flow.yaml (provisioning, modified), install-flow.yaml + connectivity-check-flow.yaml (created — were DB-only). Zero docker.sock/Docker-runner/taskRunner in the active flows (the docker.sock hits remaining are git-IGNORED .vN version snapshots, not tracked source).

RBAC: new deploy/k8s/base/kestra/kestra-rbac.yaml (ServiceAccount kestra + Role kestra-pod-runner: pods create/get/list/watch/delete/patch, pods/log, pods/exec, pods/status + RoleBinding); kestra.yaml serviceAccountName: kestra; wired into kustomization. Applied live + rollout OK. PodCreate uses fabric8 in-cluster auto-detection (SA token) — no connection block, no KESTRA_CONFIGURATION runner key needed.

AC#1 EVIDENCE: a test flow using the identical PodCreate/cytopia-ansible block ran on the live kind Kestra — execution SUCCESS; pod iotgw-ng-...-test-ansible-pod-... reached Completed in iotgw ns; task log shows ansible-core in python3.12 and hostname == pod name (proves Ansible executed inside a k8s pod, not Docker). Pod auto-deleted after.

Authored-but-unproven boundary (gated on task-062.05): the DownloadFiles->PodCreate inputFiles staging needs a POPULATED namespace-files DB; the fresh k8s Kestra PVC is empty, so full flow e2e is validated once 062.05 loads the flows/namespace files. The k8s pod-runner substrate itself is proven.
<!-- SECTION:NOTES:END -->
