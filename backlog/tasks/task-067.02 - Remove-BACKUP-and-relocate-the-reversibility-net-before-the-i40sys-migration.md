---
id: TASK-067.02
title: Remove BACKUP/ and relocate the reversibility net before the i40sys migration
status: To Do
assignee: []
created_date: '2026-06-23 08:01'
labels:
  - security
  - secrets
  - infra
milestone: Container image CI/CD (ghcr.io/i40sys)
dependencies: []
references:
  - .gitignore
  - BACKUP/git-archives/
  - BACKUP/supabase-2025-10-20/
  - BACKUP/COMPOSE-DECOMMISSION-RECOVERY.md
  - >-
    backlog/decisions/decision-013 -
    Monorepo-Organization-Single-Repo-with-Logical-Grouping.md
  - decision-012
parent_task_id: TASK-067
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BACKUP/ (19M, gitignored at .gitignore line 12, never committed — git ls-files BACKUP is empty) holds the decision-012/013 reversibility net: BACKUP/git-archives/ (7 pre-consolidation .git tarballs, kms.git.tar.gz 13.5M largest) plus BACKUP/supabase-2025-10-20/ (a frozen stack snapshot whose .env is CONFIRMED plaintext POSTGRES_PASSWORD/JWT_SECRET/SERVICE_ROLE_KEY/SECRET_KEY_BASE/VAULT_ENC_KEY). Because BACKUP/ is untracked this is a pure on-disk relocate+delete (no git-filter-repo needed for BACKUP itself), but the archives almost certainly contain pre-SOPS secrets and must be inventoried, relocated to private cold storage (private Gitea repo / offline encrypted storage), and only then deleted from disk — forfeiting the reversibility net is the documented tradeoff. This is a gate that ghcr-setup depends on before the public GitHub migration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An inventory of BACKUP/ is produced listing each item: git-archives/*.git.tar.gz (7 archives incl. kms.git.tar.gz 13.5M, iotgw-ui.git.tar.gz 3.8M), supabase-2025-10-20/ (with its confirmed-plaintext .env), claude-workspace-map-2026-06-12.json, COMPOSE-DECOMMISSION-RECOVERY.md.
- [ ] #2 A relocation target for the reversibility net is decided and documented (e.g. a private Gitea repo on git.oriolrius.cat or offline encrypted cold storage), and the archives are copied there and confirmed retrievable before any deletion.
- [ ] #3 BACKUP/ is deleted from the working tree (rm -rf, NOT git rm — it was never tracked) and `du -sh BACKUP` / `ls BACKUP` confirms it no longer exists.
- [ ] #4 It is verified and noted that BACKUP/ was never in git history (`git log --all --oneline -- 'BACKUP/*'` is empty), so no history rewrite is required for BACKUP.
- [ ] #5 .gitignore retains `/BACKUP/` (line 12) so any future BACKUP/ stays untracked.
- [ ] #6 Every credential confirmed in BACKUP/supabase-2025-10-20/.env and any found in the archives is handed off to the secret-audit rotation list, and the reversibility tradeoff (decision-012/013 net forfeited on deletion) is recorded in the relocation doc.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Enumerate BACKUP/ contents and record sizes/paths in an inventory.
2. Extract each BACKUP/git-archives/*.git.tar.gz to a temp dir and grep/scan for obvious credentials; record findings for the rotation list.
3. Decide + document the relocation target (private Gitea repo / offline encrypted storage) and copy the archives + snapshot there; verify retrievability.
4. Confirm `git log --all -- 'BACKUP/*'` is empty (no history rewrite needed) and `git ls-files BACKUP` is empty.
5. rm -rf BACKUP/ and verify it is gone; confirm .gitignore still blocks /BACKUP/.
6. Hand the credential list (esp. the supabase-2025-10-20/.env values) to secret-audit and note the reversibility tradeoff in the relocation doc.
<!-- SECTION:PLAN:END -->
