---
id: TASK-068.05
title: >-
  De-wire the [netmaker] secret render mapping and decide the fate of
  secrets/netmaker.enc.env
status: Done
assignee: []
created_date: '2026-06-25 14:17'
updated_date: '2026-06-25 14:35'
labels:
  - ansible
  - secrets
  - sops
  - cleanup
milestone: Extract netmaker collection to its own repo
dependencies:
  - TASK-068.04
references:
  - tools/secrets/secrets.sh
  - secrets/README.md
  - secrets/netmaker.enc.env
  - backlog/docs/netmaker-credential-handling.md
  - supabase/volumes/functions/netmaker-call/index.ts
parent_task_id: TASK-068
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Removing `ansible/netmaker/` leaves the `[netmaker]` SOPS render mapping pointing at a dangling target `ansible/netmaker/.env` — the exact situation the `kestra-reporter.enc.env` cleanup (commit 47f455b) handled.

**Steps:**
- Drop the `[netmaker]="ansible/netmaker/.env"` line from `tools/secrets/secrets.sh` (currently line ~36).
- Drop the `netmaker.enc.env` row from `secrets/README.md` (line ~13).
- **Decide the fate of `secrets/netmaker.enc.env`:** investigate whether the `NETMAKER_MASTER_KEY` it holds is the SAME credential the LIVE `netmaker-call` edge function uses (the edge function reads Netmaker creds from the Supabase env — check `supabase/*.enc.env` / the function's env wiring). 
  - If the key is **only** consumed by the now-removed Ansible `.env`, treat it as orphaned and remove it (mirror commit 47f455b), noting rotation per decision-014.
  - If it is **shared** with the edge function, KEEP the encrypted file but re-document it (it is no longer "for the Ansible collection" — it is the platform's Netmaker master key), and re-point/rename only the render mapping.
- Update `backlog/docs/netmaker-credential-handling.md` to reflect the collection's new external home and the corrected render targets (it currently documents `ansible/netmaker/.env` ← `secrets/netmaker.enc.env` and the `just secrets-render` output).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tools/secrets/secrets.sh no longer maps [netmaker] to ansible/netmaker/.env; secrets/README.md no longer lists a row pointing at ansible/netmaker/.env.
- [x] #2 The fate of secrets/netmaker.enc.env is decided on evidence: documented as either (a) orphaned-and-removed (key only used by the ex-Ansible .env) or (b) kept-and-redocumented as the shared platform Netmaker master key used by netmaker-call.
- [x] #3 backlog/docs/netmaker-credential-handling.md is updated to the new reality (no ansible/netmaker/.env render target; collection lives externally).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done — orphaned-and-removed.** Investigated the secret-sharing question: the live `netmaker-call` edge function reads `NETMAKER_MASTER_KEY` from `secrets/supabase.enc.env` (which carries its own copy, commented "consumed by the netmaker-call edge function"). `secrets/netmaker.enc.env` rendered **only** to `ansible/netmaker/.env`.

**Evidence the two are independent + safe to remove:** sha256 of the `NETMAKER_MASTER_KEY` value in `netmaker.enc.env` == the one in `supabase.enc.env` (byte-identical duplicate). So removing `netmaker.enc.env` loses **no** live credential — the edge-function path keeps its copy — and it **resolves the long-standing "key duplicated in both files" footgun** documented in `netmaker-credential-handling.md`.

**Changes:**
- Dropped `[netmaker]="ansible/netmaker/.env"` from `tools/secrets/secrets.sh` (+ explanatory comment).
- `git rm secrets/netmaker.enc.env`.
- Removed its row from `secrets/README.md`.
- Rewrote `netmaker-credential-handling.md`: consumer table (Ansible collection now external, no in-repo render), the footgun note (now "resolved"), and the swap-mechanics (one file, not two).

**Not rotated:** the shared master key is a shared production credential outside our control (per `netmaker-credential-handling.md`); this move does not touch it. No `.sops.yaml` change (matched the generic `\.enc\.env$` rule, no per-file entry — same as the kestra-reporter cleanup).
<!-- SECTION:NOTES:END -->
