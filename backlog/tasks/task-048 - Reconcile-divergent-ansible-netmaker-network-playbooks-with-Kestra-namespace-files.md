---
id: TASK-048
milestone: CRUD networks
parent_task_id: TASK-052
title: >-
  Reconcile divergent ansible/netmaker network playbooks with Kestra namespace
  files
status: To Do
assignee: []
created_date: '2026-04-22 05:07'
labels:
  - networks
  - netmaker
  - ansible
  - cleanup
dependencies:
  - TASK-045
references:
  - ansible/netmaker/playbooks/create_network.yml
  - ansible/netmaker/playbooks/delete_network.yml
  - ansible/netmaker/justfile
  - kestra/data/main/iotgw-ng/_files/network_update.yml
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two divergent copies of network playbooks exist:
- Production (run by Kestra): kestra/data/main/iotgw-ng/_files/network_{update,delete}.yml — reads record.id, record.ipv4_cidr from webhook JSON
- CLI playground: ansible/netmaker/playbooks/{create,delete}_network.yml — uses different var names (network_name, addressrange, netmaker_url) and delete_network.yml has a hardcoded name: iot-network bug

## Change (recommended)
Keep Kestra-run versions as canonical (synced from github.com/i40sys/iotgw-kestra). For ansible/netmaker/playbooks/:
(a) make them thin wrappers that invoke the same canonical playbook with CLI-friendly defaults, OR
(b) delete them and update ansible/netmaker/justfile + README to document that the only entry point is via Kestra.

Same audit needed for device playbooks (manage_devices.yml vs device_update.yml; delete_device.yml vs device_delete.yml).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No two diverging copies of the same playbook in the tree
- [ ] #2 ansible/netmaker/playbooks/delete_network.yml hardcoded 'name: iot-network' bug fixed (or file removed)
- [ ] #3 just create / just delete either gone or proven equivalent to the Kestra path
- [ ] #4 ansible/netmaker/CLAUDE.md and README.md updated
- [ ] #5 Same review applied to device playbooks; follow-up filed if mismatches remain
<!-- AC:END -->
