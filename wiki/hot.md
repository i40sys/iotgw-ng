---
title: Hot Cache
updated: 2026-06-26
---

# Hot Cache

*A semantic snapshot of recent activity. Updated after every major write operation.*

## Recent Activity

- [2026-06-26] INGEST pass 2/2 — distilled the task history (71 active + 44 completed + 21 archived, all Done) into 8 new pages (7 synthesis epics/feature-histories + 1 journal snapshot) and enriched 11 backbone pages with task provenance + Done status. Full backlog now ingested.
- [2026-06-26] INGEST pass 1/2 — distilled the `backlog/` backbone (21 ADRs + 15 docs) into 31 pages.
- [2026-06-26 00:00] INIT — vault created, sources = iotgw-ng `backlog/`.

## Active Threads

- **The spine** — [[provisioning-call-chain]]: UI → tRPC → Supabase pg_net trigger → `netmaker-call` edge function → Netmaker REST. Kestra is OpenWRT-only now.
- **k8s replatforming — landed.** [[synthesis/k8s-migration-epic]] (TASK-062), [[synthesis/namespace-split-epic]] (TASK-064), [[synthesis/image-cicd-epic]] (TASK-067), [[synthesis/netmaker-collection-externalization]] (TASK-068), [[synthesis/kestra-k8s-runner]] — all **Done**. Snapshot: [[journal/2026-06-26]].
- **Open residuals:** `task-067.18` (prod frontend `VITE_API_URL`), `task-062.05` (Kestra flow/KV re-seed).

## Key Takeaways

- **Decisions are authoritative.** Several docs were superseded by later ADRs — flagged with `> [!warning]` callouts (see Flagged Contradictions).
- `iotgw` is the kind **cluster** name, the Keycloak **realm**, and a **Kestra flow namespace** — but **NOT** a k8s namespace anymore ([[namespace-per-subproject]]).
- Exactly **three** custom container images ([[container-image-cicd]]); everything else is upstream pull-only.
- The Netmaker master key must **not** be rotated (shared production); mitigate with a scoped API key instead.
- **Version-exact gotcha:** no Kubernetes taskRunner at Kestra v1.3.22 → flows use `PodCreate` directly; the `DownloadFiles` leading-slash bug (task-065) blocked every run until fixed ([[kestra-k8s-runner]]).
- Every task read in pass 2 is **Done** — the `tasks/` folder holds finished k8s-era epics, not pending work.

## Flagged Contradictions

- **doc-008** shows `private_key`/`public_key`/`ssh` columns on `devices`; **decision-010** supersedes — SSH keys live in Cosmian KMS, devices hold only `ssh_key_id`. (callout on [[domains-networks-devices]], [[ssh-key-management-kms]])
- **decision-010** originally placed SSH-key generation in a Kestra flow; the 2026-06-17/task-060 amendment moved it to the iotgw-ui backend → KMS. (callout on [[ssh-key-management-kms]])
- **decision-003** ("managed Supabase Postgres") vs reality: self-hosted, Postgres tier on StackGres (decision-018). (callout on [[supabase]])
- **decision-013 / decision-015** "co-equal compose + kind paths" superseded by **decision-017** (k8s sole runtime). (callout on [[docker-compose-decommission]])
