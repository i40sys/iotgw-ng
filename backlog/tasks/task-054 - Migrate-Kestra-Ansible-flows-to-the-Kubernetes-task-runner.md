---
id: TASK-054
title: Migrate Kestra Ansible flows to the Kubernetes task runner
status: To Do
assignee: []
created_date: '2026-06-12 22:15'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In k8s the Docker task runner (host docker.sock, used by install/provisioning/connectivity flows running cytopia/ansible) does not work. Switch those flows to Kestra's Kubernetes task runner (PodCreate) or a DinD sidecar so Ansible executes as pods. See decision-015.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 install/provisioning/connectivity flows run Ansible as k8s pods (no docker.sock)
<!-- AC:END -->
