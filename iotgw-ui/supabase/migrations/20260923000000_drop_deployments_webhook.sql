-- Drop the deployments INSERT webhook (kestra-dispatch).
--
-- It was the task-062.18 e2e proof of the edge-function → Kestra handoff and
-- still targeted the test flow `k8s-ansible-runner-test`, which no longer
-- exists. Every new deployment therefore produced a FAILED deployment_jobs row
-- (Kestra 404) with an execution id Kestra never knew, so its logs could not be
-- loaded. Real install/provisioning runs are launched by the iotgw-ui backend
-- (deployments router → Kestra), not by this trigger.

drop trigger if exists deployments_webhook on public.deployments;
