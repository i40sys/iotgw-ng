# .claude/ — Claude Code ecosystem for iotgw-ng

This is the **canonical** Claude Code config for the monorepo. Operate Claude
from the repo root (`/home/oriol/iotgw-ng`) so these agents/skills/settings load.

## Agents (`.claude/agents/`)

| Agent | Model | Use for |
|---|---|---|
| **stack-operator** | sonnet | docker-compose stacks: up/down/restart/recreate, status, logs, env (supabase, kestra, kms, traefik-poc) |
| **k8s-operator** | sonnet | the kind cluster + `deploy/` kustomize: create/deploy/smoke/debug, SOPS→Secret bridge |
| **kestra-expert** | sonnet | authoring/debugging Kestra flows + config against the exact installed version |
| **supabase-function-developer** | sonnet | Deno edge functions + DB-side verification (netmaker-call is live; kestra-call legacy) |
| **task-implementer** | sonnet | implement a backlog task end-to-end |
| **project-manager-backlog** | inherit | create/structure backlog tasks via the Backlog.md CLI |
| **backlog-docs-architect** | opus | analyze the codebase + keep backlog docs in sync |
| **test-suite-creator** | sonnet | author Vitest suites for tRPC procedures / React components |
| **github-repo-manager** | haiku | git/gh operations (note: the monorepo has no remote yet — see decision-013 Q4) |
| **docs-writer-codex** | sonnet | author/refresh README/CLAUDE/docs via the codex CLI |

Operating split: **stack-operator = docker-compose**, **k8s-operator = kubernetes/kind**. They share the same foreign-workload safety discipline (only touch iotgw-ng-owned resources).

## Skills (`.claude/skills/`)

Generic frontend/TS skill packs (react-19, trpc-v11, tailwind-css-v4, vitest, pnpm-workspaces, …) plus `_supabase-notes/` (legacy flat-format supabase runbooks, kept as reference). Most are sourced from the user's LiteLLM plugin marketplace.

## Settings

- `settings.json` — codegraph MCP tool allowlist (the codegraph server itself is declared in `iotgw-ui/.mcp.json`).
- `settings.local.json` — Bash command allowlist (pnpm/backlog/git + now `just`, `kubectl`, `kind`, `helm`, `sops`, `age`, `docker compose`, `secrets.sh`, `verify.sh`, `bootstrap.sh`) to reduce permission prompts. Gitignored.

## Duplication note

`iotgw-ui/.claude/agents` + `iotgw-ui/.claude/skills` are byte-identical copies of
five of these agents + the skills, kept so iotgw-ui-cwd sessions still have them
(Claude resolves project config from the cwd). The **root** set is canonical and
broader (it adds the operational agents). When updating an agent that exists in
both, update the root copy; the duplicate is only for iotgw-ui-focused sessions.
`iotgw-ui/.claude/CLAUDE.md` (codegraph usage) + `iotgw-ui/.mcp.json` (codegraph
server) are iotgw-ui-specific and intentionally not duplicated here.
