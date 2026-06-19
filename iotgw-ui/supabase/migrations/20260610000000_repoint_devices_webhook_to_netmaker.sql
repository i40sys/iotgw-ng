-- Repoint the devices INSERT + DELETE webhooks from the `kestra-call` edge
-- function to the new `netmaker-call` edge function, which provisions Netmaker
-- extclients directly via the Netmaker REST API (bypassing the Kestra/Ansible
-- hop). The `networks` table webhook is repointed in 20260610000001.
--
-- The target is the in-cluster `kong` Service DNS (`http://kong:8000`), which
-- also resolves on the legacy supabase compose network — engine-neutral, so a
-- fresh apply reproduces the live k8s state (task-055). The former compose host
-- `http://wsl.ymbihq.local:8000` was host-routed only.
--
-- Reversible: re-point both triggers back to `.../functions/v1/kestra-call`.

drop trigger if exists devices_webhook on public.devices;
create trigger devices_webhook
  after insert
  on public.devices
  for each row
  execute function supabase_functions.http_request(
    'http://kong:8000/functions/v1/netmaker-call',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );

drop trigger if exists devices_webhook_delete on public.devices;
create trigger devices_webhook_delete
  after delete
  on public.devices
  for each row
  execute function supabase_functions.http_request(
    'http://kong:8000/functions/v1/netmaker-call',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
