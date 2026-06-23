# kestra-dispatch — Edge-Function → Kestra Durable-Execution Handoff

**This function implements the "thin handoff" contract from decision-016 §6.**
It receives a Supabase DB webhook POST on `deployments` INSERT and immediately
dispatches a Kestra flow execution for long-running work, returning 202 without
waiting for the flow to complete.

## Purpose / Contract

```
DB trigger (deployments, INSERT only)
  → POST /functions/v1/kestra-dispatch
  → DB lookups: device → network → domain
  → POST /api/v1/{tenant}/executions/{namespace}/{flowId}  (Kestra REST)
  → record Kestra execution_id in deployment_jobs (status PENDING)
  → return 202 Accepted
  → Kestra flow runs (potentially minutes)
  → Kestra final write-back task: PATCH deployment_jobs status=SUCCESS/FAILED
```

The Deployments UI polling (`get_deployment_jobs` RPC) is **unchanged** — it
still reads `deployment_jobs`.

## Trigger

`deployments` table — **INSERT only**. The trigger does not fire on UPDATE or
DELETE; updating `deployments` never re-dispatches Kestra (no trigger loop).

Webhook payload: `{ type:"INSERT", table:"deployments", schema:"public", record:{id, device_id, name, configuration, version, ...}, old_record:null }`

## Kestra target flow

Default (env `KESTRA_DISPATCH_FLOW_ID`): `k8s-ansible-runner-test`
- No inputs required.
- Completes quickly (runs an Ansible version check pod).
- Used for contract validation / e2e proof.

Real deployment flows: `provisioning` / `install` (both accept a `json_data` JSON input).
Override `KESTRA_DISPATCH_FLOW_ID` in the functions Deployment env, or extend
the function to pick the flow based on the deployment `configuration` payload.

## Kestra REST trigger call

```
POST http://kestra.kestra.svc.cluster.local:8080/api/v1/main/executions/iotgw-ng/{flowId}
Authorization: Basic base64(KESTRA_USER:KESTRA_PASSWORD)
```

- No body for flows with no inputs (e.g. `k8s-ansible-runner-test`).
- `multipart/form-data` with field `json_data` for flows that require a JSON input.
- Returns: `{ id: "<kestra-execution-uuid>", ... }`

## deployment_jobs lifecycle

| Phase | execution_id | status | Who sets it |
|---|---|---|---|
| 202 accepted (placeholder) | `kestra-dispatch-<uuid>` | PENDING | This function (sync) |
| Trigger call succeeded | same placeholder | RUNNING + error_message=exec id | Background (waitUntil) |
| Trigger call failed | same placeholder | FAILED + error_message | Background (waitUntil) |
| Real row (Kestra exec id) | `<kestra-execution-uuid>` | PENDING | Background (waitUntil) |
| Kestra flow finished | `<kestra-execution-uuid>` | SUCCESS / FAILED | Kestra write-back task |

Two rows are created: a short-lived placeholder (for immediate UI feedback) and
a durable row keyed by the Kestra execution UUID (reconciled by Kestra).

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | `http://kong:8000` — intra-namespace (this fn runs in `supabase-app` with Kong) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | bypasses RLS for DB writes |
| `KESTRA_BASE_URL` | yes | **must be `http://kestra.kestra.svc.cluster.local:8080`** (cross-namespace Service FQDN — Kestra is in the `kestra` namespace, `decision-020`) |
| `KESTRA_USER` | yes | basic-auth username; from `supabase-env` Secret |
| `KESTRA_PASSWORD` | yes | basic-auth password; from `supabase-env` Secret |
| `KESTRA_DISPATCH_FLOW_ID` | no | default `k8s-ansible-runner-test` |
| `KESTRA_TENANT` | no | default `main` |
| `KESTRA_NAMESPACE` | no | default `iotgw-ng` |

**`KESTRA_BASE_URL` must point to the in-cluster Service FQDN
(`http://kestra.kestra.svc.cluster.local:8080`), NOT the external host
(`http://wsl.ymbihq.local:8080`).** Kestra now lives in the `kestra` namespace
(`decision-020`), so the cross-namespace call needs the fully-qualified name. The
`supabase-env` Secret's `KESTRA_BASE_URL` key was patched in task-062.18 to the
in-cluster URL. If you recreate the Secret from the SOPS store without this patch,
remember to re-patch the Secret key.

## Kestra write-back (flow side)

The Kestra flow must include a **final task** that PATCHes `deployment_jobs`
via PostgREST to set the status to SUCCESS or FAILED. This is an `http.Request`
task (or a shell `curl`) against:

```
PATCH http://kong.supabase-app.svc.cluster.local:8000/rest/v1/deployment_jobs?execution_id=eq.{{ execution.id }}
Authorization: Bearer <SERVICE_ROLE_KEY>
Content-Type: application/json
Prefer: return=minimal

{ "status": "SUCCESS", "completed_at": "<now>" }
```

The `k8s-ansible-runner-test` flow was extended in task-062.18 to include this
write-back task as its final step.

## DB trigger

`deployments_webhook` trigger (migration `20260618000000_create_deployments_webhook.sql`):

```sql
create trigger deployments_webhook
  after insert on public.deployments
  for each row execute function supabase_functions.http_request(
    'http://kong.supabase-app.svc.cluster.local:8000/functions/v1/kestra-dispatch',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
```

**INSERT-only** — never fires on UPDATE/DELETE (avoids trigger loops, matches
the same footgun guard as `devices_webhook`).

## References

- `decision-016 §6` — fast/long-running split + Kestra handoff contract
- `backlog/tasks/task-062.18` — this implementation
- `netmaker-call/CLAUDE.md` — the fast-path template this mirrors
- `iotgw-ui/apps/backend/src/routers/deployments.ts:executeKestraDeployment`
  — the backend-originated Kestra trigger path (coexists; not replaced here)
