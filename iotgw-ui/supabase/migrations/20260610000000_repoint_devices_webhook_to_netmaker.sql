-- Repoint the devices INSERT + DELETE webhooks from the `kestra-call` edge
-- function to the new `netmaker-call` edge function, which provisions Netmaker
-- extclients directly via the Netmaker REST API (bypassing the Kestra/Ansible
-- hop). The `networks` table webhook is intentionally left on `kestra-call`.
--
-- Reversible: re-point both triggers back to `.../functions/v1/kestra-call`.

drop trigger if exists devices_webhook on public.devices;
create trigger devices_webhook
  after insert
  on public.devices
  for each row
  execute function supabase_functions.http_request(
    'http://wsl.ymbihq.local:8000/functions/v1/netmaker-call',
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
    'http://wsl.ymbihq.local:8000/functions/v1/netmaker-call',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
