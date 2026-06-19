---
description: Manage Supabase k8s services (start, stop, restart, logs, health)
---

# Manage Services Skill

You are helping manage the Supabase services on the local `kind`/k8s cluster
(`decision-017` made k8s the sole supported runtime; the old compose stack is
decommissioned). All workloads live in the `iotgw` namespace. Follow these steps:

1. **Understand the request**:
   - What service(s) need management?
   - What action: start, stop, restart, view logs, check health, rebuild?

2. **Available services** (Deployments in the `iotgw` namespace, unless noted):
   - `kong` - API Gateway (NodePort 30800 → host 8000)
   - `auth` - Authentication service (GoTrue)
   - `rest` - REST API (PostgREST)
   - `functions` - Edge functions (Deno runtime)
   - `meta` - Database metadata API
   - `cosmian-kms` - Cosmian KMS (device SSH keys)
   - `kestra` - workflow orchestration
   - `supabase-db` - PostgreSQL, a **StackGres `SGCluster`** (not a Deployment;
     see Database below)
   - *Not deployed* (`decision-018` §4): `studio`, `realtime`, `storage`,
     `supavisor`, `analytics`, `imgproxy`, `vector` — these are intentionally
     dropped from the k8s stack.

3. **Common operations**:

   **Start the whole platform** (create cluster + deploy + smoke):
   ```bash
   just bootstrap   # = just kind-up + just k8s-deploy + just k8s-smoke
   ```

   **Tear the cluster down** (removes the cluster and all its data):
   ```bash
   just kind-down
   ```

   **Restart specific service**:
   ```bash
   kubectl -n iotgw rollout restart deploy/<service-name>
   ```

   **View logs**:
   ```bash
   # Specific service
   kubectl -n iotgw logs -f deploy/<service-name>

   # Last N lines
   kubectl -n iotgw logs --tail=100 deploy/<service-name>
   ```

   **Check health**:
   ```bash
   kubectl -n iotgw get pods
   ```

   **Rebuild + redeploy a service**:
   ```bash
   # Re-apply the kind overlay (rebuilds the functions/iotgw-ui images and
   # applies the manifests).
   just k8s-deploy
   ```

4. **Service-specific operations**:

   **Database (supabase-db)** — a StackGres SGCluster; psql runs inside the
   primary pod's `patroni` container:
   ```bash
   # Resolve the StackGres primary pod
   PG=$(kubectl -n iotgw get pod -l 'stackgres.io/cluster-name=supabase-db,role=master' \
          -o jsonpath='{.items[0].metadata.name}')

   # Connect to database
   kubectl -n iotgw exec -it "$PG" -c patroni -- psql -U postgres -d postgres

   # View database logs
   kubectl -n iotgw logs -f "$PG" -c patroni

   # Apply the iotgw-ui migration set (careful - schema change)
   deploy/kind/bootstrap.sh migrate
   ```

   **Edge Functions (functions)**:
   ```bash
   # Redeploy after code changes (code is baked into iotgw-functions:local)
   deploy/kind/bootstrap.sh functions
   kubectl -n iotgw rollout restart deploy/functions

   # View function logs
   kubectl -n iotgw logs -f deploy/functions

   # Check if functions are loaded
   kubectl -n iotgw logs deploy/functions | grep "started"
   ```

   **API Gateway (kong)**:
   ```bash
   # Restart Kong
   kubectl -n iotgw rollout restart deploy/kong

   # View routing logs
   kubectl -n iotgw logs -f deploy/kong
   ```

   **Studio UI (studio)**:
   - *Not deployed* on k8s (`decision-018` §4) — there is no Studio UI on the
     running cluster. Use psql / PostgREST directly instead.

5. **Health checks**:
   ```bash
   # Check all pods' status (Ready/Running)
   kubectl -n iotgw get pods

   # Check a specific Deployment's rollout
   kubectl -n iotgw rollout status deploy/<service-name>

   # Describe a pod for events/probe failures
   kubectl -n iotgw describe pod -l app=<service-name>
   ```

6. **Complete reset** (destructive):
   ```bash
   # Delete the cluster (and all its data), then bring it back up clean
   just kind-down
   just bootstrap
   ```

7. **Troubleshooting**:

   **Service won't start**:
   - Check logs: `kubectl -n iotgw logs deploy/<service-name>`
   - Check events/probes: `kubectl -n iotgw describe pod -l app=<service-name>`
   - Check the DB tier is Ready (the app tier depends on `supabase-db`)
   - Check the `supabase-env` Secret has the expected vars (`envFrom`)

   **Service unhealthy**:
   - Check readiness/liveness probe failures in `describe`
   - Verify dependencies (the StackGres primary) are Ready
   - Check in-cluster connectivity (Service names) between pods
   - Roll the deployment: `kubectl -n iotgw rollout restart deploy/<service-name>`

   **Out of sync**:
   - Re-apply the overlay: `just k8s-deploy`
   - Re-publish Secrets after a change: `deploy/kind/bootstrap.sh secrets`

8. **Monitoring**:
   ```bash
   # Per-pod resource usage (needs metrics-server)
   kubectl -n iotgw top pods

   # Recent namespace events
   kubectl -n iotgw get events --sort-by=.lastTimestamp
   ```

9. **After operations**:
   - Verify pods are healthy: `kubectl -n iotgw get pods`
   - Check logs for errors
   - Test critical functionality
   - Report status to user

## Service Dependencies

Remember the dependency chain:
- The app-tier Deployments (`auth`, `rest`, `meta`, `functions`, `kong`) depend
  on the StackGres `supabase-db` primary being Ready
- k8s manages ordering/readiness via probes (no compose `depends_on`); a pod
  that comes up before the DB is Ready will restart until its probes pass

When a service stays unhealthy, check that `supabase-db` is Ready first, then
roll the dependent Deployment.
