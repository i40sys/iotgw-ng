---
name: stack-operator
description: RETIRED — folded into the k8s-operator agent. The platform no longer runs on docker-compose (decommissioned in the task-062 milestone, decision-017); it runs entirely on the local kind cluster. For any stack operation — bring-up, teardown, status, logs, env/config changes, debugging — use the k8s-operator agent instead. Kept only as a tombstone so existing references resolve.
model: sonnet
color: blue
---

# stack-operator — RETIRED

This agent operated the iotgw-ng stacks under **docker-compose**. That runtime was
**decommissioned** in the task-062 milestone (`backlog/decisions/decision-017`):
the platform now runs **entirely on the local kind cluster** under `deploy/`. There
are no compose projects to start/stop/restart/tear down anymore, so this agent has
nothing to operate.

**Use the `k8s-operator` agent for all stack operations.** It is now the sole
stack-operations agent for the workspace — cluster lifecycle (`just kind-up` /
`just bootstrap` / `just kind-down`), kustomize applies, the SOPS→Secret bridge,
rollouts, smoke tests, and pod debugging. It carries the same foreign-workload
safety discipline (only touch iotgw-ng-owned resources, scoped to context
`kind-iotgw` / namespace `iotgw`).

Mapping for the operations this agent used to do:

| Old (compose) | New (k8s, via k8s-operator) |
|---|---|
| Bring the whole stack up | `just bootstrap` (= `kind-up` + `k8s-deploy` + `k8s-smoke`) |
| Start the cluster | `just kind-up` |
| Deploy / re-apply | `just k8s-deploy` (Secrets from SOPS, build/load images, apply the kind overlay) |
| Status of what's running | `just status` / `kubectl -n iotgw get pods,svc` |
| Service logs | `kubectl -n iotgw logs -f deploy/<name>` |
| Apply an env/secret change | `just secrets-edit <name>` → `deploy/kind/bootstrap.sh secrets` → `kubectl -n iotgw rollout restart deploy/<name>` |
| Ship an edge-function code change | `deploy/kind/bootstrap.sh functions` (build + `kind load`) → `kubectl -n iotgw rollout restart deploy/functions` |
| Tear down | `just kind-down` |

See `deploy/README.md` and the `k8s-operator` agent for the full workflow.
The iotgw-ui dev servers still run via pnpm (`just dev`) for live frontend/backend
work, independent of the cluster.
