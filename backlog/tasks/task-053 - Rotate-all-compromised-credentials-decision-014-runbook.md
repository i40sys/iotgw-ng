---
id: TASK-053
title: Rotate all compromised credentials (decision-014 runbook)
status: To Do
assignee: []
created_date: '2026-06-12 22:15'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The 2026-06-12 secret sweep found 17 credential groups that are exposed (tracked source, git history, or the i40sys/iotgw-kestra remote). SOPS now stops new leakage but the values must be rotated at their upstream services. Follow the rotation table in backlog/decisions/decision-014.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Netmaker master key rotated + secrets.sh edit netmaker/supabase
- [ ] #2 Supabase JWT_SECRET rotated and anon/service_role JWTs re-minted
- [ ] #3 Kestra basic-auth password rotated across all consumers
- [ ] #4 Gemini, OpenAI, 3 GitHub PATs, Notion, Kutt keys rotated
- [ ] #5 Traefik TLS leaf + WireGuard/SSH keys regenerated
<!-- AC:END -->
