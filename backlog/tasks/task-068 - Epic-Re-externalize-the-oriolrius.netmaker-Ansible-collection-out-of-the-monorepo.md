---
id: TASK-068
title: >-
  Epic: Re-externalize the oriolrius.netmaker Ansible collection out of the
  monorepo
status: Done
assignee: []
created_date: '2026-06-25 14:15'
updated_date: '2026-06-25 14:35'
labels:
  - ansible
  - galaxy
  - repo-extraction
  - docs
  - epic
milestone: Extract netmaker collection to its own repo
dependencies: []
references:
  - ansible/netmaker/
  - 'https://github.com/oriolrius/netmaker-ansible-automation'
  - 'https://galaxy.ansible.com/ui/repo/published/oriolrius/netmaker/'
  - decision-012
  - decision-013
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Re-externalize the `oriolrius.netmaker` Ansible collection so it lives **alone**, outside `~/iotgw-ng`, and remove the duplicate copy that was absorbed into the monorepo during the `decision-012` consolidation.

**Double-check finding (the premise of this epic):** a standalone repo **already exists and is live** — `github.com/oriolrius/netmaker-ansible-automation` (public, default branch `main`, last pushed 2025-10-21). It carries `.github/workflows/publish-collection.yml`, which **publishes `oriolrius.netmaker` to Ansible Galaxy** (currently v1.0.3). `decision-012` (line 31) records that the monorepo's `ansible/netmaker/` was consolidated *from exactly this repo*. So this is **not** a "create new repo" job — it is "re-externalize, reconcile, de-dupe, and re-align docs," mirroring the `kestra-ansible-reporter` extraction precedent (commits 5408797 / 47f455b).

**Decisions locked (asked & answered):**
- **Canonical home:** *adopt the existing* `github.com/oriolrius/netmaker-ansible-automation` (no transfer to i40sys). The Ansible **Galaxy namespace stays `oriolrius`** (account-level, baked into `galaxy.yml`, independent of any GitHub org).
- **Reconciliation:** *diff + port-back, then delete* — port any monorepo-only changes back to the standalone repo (cut a Galaxy release if code changed) **before** removing `ansible/netmaker/` from this repo.

**Scope boundary:** the collection is **reference-only** for this platform now — the LIVE device/network provisioning runs through the Supabase `netmaker-call` edge function (direct Netmaker REST), not this collection. Kestra still installs `oriolrius.netmaker` **from Galaxy** (FQCN) at runtime for OpenWRT-side flows; it never depended on the in-repo source. So removing the in-repo copy changes **no runtime behavior** — only the source-of-truth location and the docs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All subtasks are Done; the milestone 'Extract netmaker collection to its own repo' shows complete.
- [x] #2 The standalone repo github.com/oriolrius/netmaker-ansible-automation is the sole canonical source: its HEAD is a superset of everything that was in the monorepo ansible/netmaker/, and its Galaxy publish CI is live (a workflow_dispatch build succeeds; oriolrius.netmaker is publishable).
- [x] #3 ansible/netmaker/ no longer exists in the iotgw-ng repo, and no tracked file references it as a live in-repo path (only historical/superseded ADR notes may mention it, clearly marked).
- [x] #4 The [netmaker] secret render mapping (tools/secrets/secrets.sh) and its secrets/README.md row are removed; the fate of secrets/netmaker.enc.env is explicitly decided (kept-and-documented or orphaned-and-removed) based on whether the netmaker-call edge function shares the key.
- [x] #5 Root README.md, root CLAUDE.md, ansible/CLAUDE.md, kestra/CLAUDE.md, the netmaker-call edge function (index.ts + CLAUDE.md), decision-012, decision-013, doc-016, netmaker-credential-handling.md, and the affected agent definitions all reflect that the collection lives at github.com/oriolrius/netmaker-ansible-automation (+ Galaxy), not in this repo.
- [x] #6 just secrets-render and just verify run clean with no dangling ansible/netmaker reference; CLAUDE memory is updated.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. **Record the decision** — ADR `decision-022` adopting the existing oriolrius repo as canonical and resolving the `decision-012`/`decision-013` "mislocated CI" open-question.
2. **Reconcile** — diff the monorepo copy against the standalone repo HEAD, port monorepo-only changes back, bump + publish to Galaxy if code changed.
3. **Re-activate CI** — confirm the standalone repo's Galaxy publish workflow is live again and the public repo is secret-clean.
4. **De-dupe** — `git rm -r ansible/netmaker/`, handle the now-empty `ansible/` wrapper, and de-wire the `[netmaker]` secret render mapping.
5. **Re-align all docs** — README, root + sub CLAUDE.md, decisions, docs, edge-function "reference spec" pointers, agent definitions.
6. **Validate** — `just verify` / `just secrets-render` dangle-free; update memory; close the milestone.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done 2026-06-25.** All 8 subtasks complete. The `oriolrius.netmaker` collection is re-externalized; `ansible/` removed from the monorepo.

**Key finding (the "double check"):** the standalone repo already existed and was live — `github.com/oriolrius/netmaker-ansible-automation` (public, Galaxy-publishing `oriolrius.netmaker`, last green run 2025-10-21). A byte-level diff proved every shipped path was already identical, so **no port-back, no version bump, no republish** — just adopt-as-canonical + de-dupe. Decision recorded in `decision-022`.

**Removed from the monorepo:** `ansible/` (whole folder), `secrets/netmaker.enc.env` (a byte-identical duplicate of the live key in `supabase.enc.env` — removal lost no live credential and fixed the two-files footgun), and the `[netmaker]` render mapping.

**Re-aligned docs:** decision-022 (new) + forward-pointers on 012/013; README, root CLAUDE.md, kestra/CLAUDE.md, netmaker-call index.ts+CLAUDE.md, doc-016, netmaker-credential-handling.md, build-image.yml, 2 agent defs.

**Validation:** `secrets-render`/`secrets-check`/`verify` all green for every check this work touches (incl. full kind smoke). The only `verify` red is a pre-existing task-067 secret-tripwire hit, confirmed unrelated.

**No runtime change:** Kestra still installs `oriolrius.netmaker` from Galaxy by FQCN; netmaker-call keeps its own key. Resolves the decision-012/013 mislocated-CI open question. Mirrors the kestra-ansible-reporter extraction.

**Follow-up (owner action, non-blocking):** enable native secret-scanning + push-protection on the standalone repo (needs oriolrius repo-admin; history is already clean).
<!-- SECTION:NOTES:END -->
