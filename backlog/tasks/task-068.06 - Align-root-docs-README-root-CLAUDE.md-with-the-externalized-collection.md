---
id: TASK-068.06
title: Align root docs (README + root CLAUDE.md) with the externalized collection
status: Done
assignee: []
created_date: '2026-06-25 14:17'
updated_date: '2026-06-25 14:35'
labels:
  - docs
  - repo-extraction
milestone: Extract netmaker collection to its own repo
dependencies:
  - TASK-068.04
references:
  - README.md
  - CLAUDE.md
parent_task_id: TASK-068
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Re-align the two top-level docs so they no longer present the Ansible collection as an in-repo subproject.

**Steps:**
- `README.md` (line ~20): the repo-map row ``| `ansible/` | **automation** | The `oriolrius.netmaker` Ansible collection. |`` must be removed or rewritten to point at the external repo + Galaxy (the folder no longer exists). Fix any `just`/orchestrator wording that assumed `ansible/`.
- Root `CLAUDE.md`: remove the `ansible/netmaker/` row from the **Subprojects** table and its `Entry CLAUDE.md` link; adjust **The Real Call Chain** / "Kestra is still used" wording so it references `oriolrius.netmaker` (Galaxy + external repo URL) rather than the in-repo path; keep the accurate statement that Kestra installs the collection from Galaxy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 README.md no longer lists ansible/ as an in-repo subproject; any reference to the collection points to github.com/oriolrius/netmaker-ansible-automation + Galaxy.
- [x] #2 Root CLAUDE.md Subprojects table has no ansible/netmaker/ row, and the call-chain / Kestra wording references the external collection (Galaxy FQCN) instead of the in-repo path.
- [x] #3 No tracked root-doc line presents ansible/netmaker/ as a live in-repo location.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.**
- `README.md`: removed the `ansible/` row from the repo map; dropped "the automation collection" from the intro sentence. The remaining "→ Ansible" call-chain mentions correctly describe the Kestra→Ansible OpenWRT path (still live) and were left.
- Root `CLAUDE.md`: removed the `ansible/netmaker/` Subprojects-table row; added a bullet in the call-chain section stating the collection now lives at `github.com/oriolrius/netmaker-ansible-automation` (Galaxy `oriolrius.netmaker`, `decision-022`), Kestra installs it from Galaxy by FQCN, and there is no in-repo Ansible source.
<!-- SECTION:NOTES:END -->
