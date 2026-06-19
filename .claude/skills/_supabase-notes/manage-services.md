---
description: Manage Supabase services on the kind/k8s cluster (start, stop, restart, logs, health)
---

# Manage Services Skill

You are helping manage Supabase services on the local kind/k8s cluster
(namespace `iotgw`). Follow these steps:

1. **Understand the request**:
   - What service(s) need management?
   - What action: start, stop, restart, view logs, check health, rebuild?

2. **Deployed services** (k8s Deployments in namespace `iotgw`):
   - `kong` - API Gateway (port 8000 via NodePort 30800)
   - `auth` - Authentication service (GoTrue)
   - `rest` - REST API (PostgREST)
   - `functions` - Edge functions (Deno runtime; image `iotgw-functions:local`)
   - `meta` - Database metadata API
   - `cosmian-kms` - Cosmian KMS
   - `kestra` - Workflow orchestration
   - StackGres `SGCluster` `supabase-db` - PostgreSQL database (not a Deployment)

   **Intentionally NOT deployed** (decision-018 §4): `studio`, `realtime`,
   `storage`, `supavisor`, `analytics`, `imgproxy`, `vector`. These are dropped
   on purpose — do not try to start them.

3. **Common operations**:

   **Bring up the whole stack** (creates kind cluster, deploys, smoke-tests):
   ```bash
   just bootstrap
   ```

   **Tear down the whole stack**:
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

   **Rebuild + redeploy a service** (re-apply the kind overlay):
   ```bash
   just k8s-deploy
   ```

4. **Service-specific operations**:

   **Database (StackGres SGCluster `supabase-db`)**:
   ```bash
   # Resolve the primary pod
   PG=$(kubectl -n iotgw get pod -l 'stackgres.io/cluster-name=supabase-db,role=master' -o jsonpath='{.items[0].metadata.name}')

   # Connect to database
   kubectl -n iotgw exec -it "$PG" -c patroni -- psql -U postgres -d postgres

   # View database logs (patroni container on the primary pod)
   kubectl -n iotgw logs -f "$PG" -c patroni

   # NOTE: don't "restart db" to refresh PostgREST — instead reload its schema
   # cache with: kubectl -n iotgw rollout restart deploy/rest
   ```

   **Edge Functions (functions)**:
   ```bash
   # Deploy a CODE change — code is baked into iotgw-functions:local, so rebuild
   # + kind-load + rollout (a plain rollout only re-pulls the loaded image):
   deploy/kind/bootstrap.sh functions
   kubectl -n iotgw rollout restart deploy/functions

   # Clear the module cache without a code change (re-pulls the loaded image):
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

5. **Health checks**:
   ```bash
   # Check all pods' status
   kubectl -n iotgw get pods

   # Describe a specific Deployment (conditions, events)
   kubectl -n iotgw describe deploy/<service-name>

   # Example for the API gateway
   kubectl -n iotgw describe deploy/kong
   ```

6. **Complete reset** (destructive):
   ```bash
   # Tear down the cluster and re-bootstrap from scratch
   just kind-down && just bootstrap
   ```

7. **Troubleshooting**:

   **Service won't start**:
   - Check logs: `kubectl -n iotgw logs deploy/<service-name>`
   - Check events/conditions: `kubectl -n iotgw describe deploy/<service-name>`
   - Check dependencies: Ensure the StackGres primary `supabase-db` is Ready
   - Check env: Verify the `supabase-env` Secret is present and current

   **Service unhealthy**:
   - Check pod events: `kubectl -n iotgw describe pod <pod-name>`
   - Verify dependencies are running
   - Check in-cluster connectivity between Services
   - Restart dependent Deployments

   **Out of sync**:
   - Re-apply the kind overlay: `just k8s-deploy`
   - Force a fresh rollout: `kubectl -n iotgw rollout restart deploy/<service-name>`

8. **Monitoring**:
   ```bash
   # Resource usage (requires metrics-server)
   kubectl -n iotgw top pods

   # All resources in the namespace
   kubectl -n iotgw get all

   # Services / endpoints
   kubectl -n iotgw get svc,endpoints
   ```

9. **After operations**:
   - Verify pods are healthy: `kubectl -n iotgw get pods`
   - Check logs for errors
   - Test critical functionality
   - Report status to user

## Service Dependencies

Remember the dependency chain:
- The app-tier services (`kong`, `rest`, `auth`, `meta`, `functions`) depend on
  the StackGres primary `supabase-db` being Ready
- `kong` fronts the edge functions and the other app-tier services

When restarting services, consider restarting dependent Deployments if issues persist.
