# .claude/ — Claude Code ecosystem for iotgw-ng

This is the **canonical** Claude Code config for the monorepo. Operate Claude
from the repo root (`/home/oriol/iotgw-ng`) so these agents/skills/settings load.

## Agents (`.claude/agents/`)

| Agent | Model | Use for |
|---|---|---|
| **k8s-operator** | sonnet | **the sole stack operator** — the kind cluster + `deploy/` kustomize: create/deploy/smoke/debug, SOPS→Secret bridge, rollouts |
| ~~stack-operator~~ | sonnet | **RETIRED** (tombstone) — docker-compose was decommissioned (`decision-017`); folded into k8s-operator |
| **kestra-expert** | sonnet | authoring/debugging Kestra flows + config against the exact installed version |
| **supabase-function-developer** | sonnet | Deno edge functions + DB-side verification (netmaker-call is live; kestra-call legacy) |
| **task-implementer** | sonnet | implement a backlog task end-to-end |
| **project-manager-backlog** | inherit | create/structure backlog tasks via the Backlog.md CLI |
| **backlog-docs-architect** | opus | analyze the codebase + keep backlog docs in sync |
| **test-suite-creator** | sonnet | author Vitest suites for tRPC procedures / React components |
| **github-repo-manager** | haiku | git/gh operations (note: the monorepo has no remote yet — see decision-013 Q4) |
| **docs-writer-codex** | sonnet | author/refresh README/CLAUDE/docs via the codex CLI |

Operations: **k8s-operator** is the single stack-operations agent (the platform runs entirely on the kind cluster; docker-compose was decommissioned in the task-062 milestone, `decision-017`). The former `stack-operator` is a retired tombstone pointing at it. It keeps the foreign-workload safety discipline (only touch iotgw-ng-owned resources, scoped to context `kind-iotgw` / namespace `iotgw`).

## Skills (`.claude/skills/`)

Generic frontend/TS skill packs (react-19, trpc-v11, tailwind-css-v4, vitest, pnpm-workspaces, …) plus `_supabase-notes/` (legacy flat-format supabase runbooks, kept as reference). Most are sourced from the user's LiteLLM plugin marketplace.

## Settings

- `settings.json` — codegraph MCP tool allowlist (the codegraph server itself is declared in `iotgw-ui/.mcp.json`).
- `settings.local.json` — Bash command allowlist (pnpm/backlog/git + `just`, `kubectl`, `kind`, `helm`, `sops`, `age`, `docker build`/`kind load` for image bakes, `secrets.sh`, `verify.sh`, `bootstrap.sh`) to reduce permission prompts. Gitignored.

## Duplication note

`iotgw-ui/.claude/agents` + `iotgw-ui/.claude/skills` are byte-identical copies of
five of these agents + the skills, kept so iotgw-ui-cwd sessions still have them
(Claude resolves project config from the cwd). The **root** set is canonical and
broader (it adds the operational agents). When updating an agent that exists in
both, update the root copy; the duplicate is only for iotgw-ui-focused sessions.
`iotgw-ui/.claude/CLAUDE.md` (codegraph usage) + `iotgw-ui/.mcp.json` (codegraph
server) are iotgw-ui-specific and intentionally not duplicated here.
