---
id: TASK-045
milestone: CRUD networks
parent_task_id: TASK-052
title: Externalize Netmaker master_key out of network_*.yml playbooks into Kestra KV
status: To Do
assignee: []
created_date: '2026-04-22 05:06'
labels:
  - security
  - networks
  - netmaker
  - kestra
  - ansible
dependencies: []
references:
  - kestra/data/main/iotgw-ng/_files/network_update.yml
  - kestra/data/main/iotgw-ng/_files/network_delete.yml
  - kestra/CLAUDE.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Both kestra/data/main/iotgw-ng/_files/network_update.yml and network_delete.yml hardcode netmaker_master_key=***REMOVED-DECOMMISSIONED*** in cleartext. Same files are mirrored to GitHub via sync-namespace-files, so the secret is also in github.com/i40sys/iotgw-kestra history.

## Change
1. Remove the hardcoded var from both playbooks.
2. Store the key in Kestra KV under namespace iotgw-ng as NETMAKER_MASTER_KEY (sibling to existing GITHUB_ACCESS_TOKEN — verified used by sync-namespace-files flow).
3. In iotgw-ng/networks flow YAML, inject via -e 'netmaker_master_key={{ kv("NETMAKER_MASTER_KEY") }}'.
4. ROTATE the key in Netmaker — the old one is in git history publicly.
5. Audit device flows for the same anti-pattern (file follow-up if found).

## Verified pattern
sync-namespace-files flow already uses {{ kv('GITHUB_ACCESS_TOKEN') }}.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No plaintext master key remains in any file under kestra/data/main/iotgw-ng/_files/
- [ ] #2 No plaintext master key in current HEAD of github.com/i40sys/iotgw-kestra
- [ ] #3 Kestra KV NETMAKER_MASTER_KEY exists in iotgw-ng namespace
- [ ] #4 iotgw-ng/networks flow source updated to inject the secret via -e (verified by GET /api/v1/main/flows/iotgw-ng/networks?source=true)
- [ ] #5 Old master key rotated in Netmaker (api.netmaker.i40sys.com)
- [ ] #6 Device flows audited; if same anti-pattern present, follow-up task filed
<!-- AC:END -->
