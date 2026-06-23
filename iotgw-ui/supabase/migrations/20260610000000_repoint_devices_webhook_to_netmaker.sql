-- Repoint the devices INSERT + DELETE webhooks from the `kestra-call` edge
-- function to the new `netmaker-call` edge function, which provisions Netmaker
-- extclients directly via the Netmaker REST API (bypassing the Kestra/Ansible
-- hop). The `networks` table webhook is repointed in 20260610000001.
--
-- The target is the in-cluster `kong` Service FQDN
-- (`http://kong.supabase-app.svc.cluster.local:8000`) — kong now lives in the
-- `supabase-app` namespace while the DB lives in `supabase-db` (decision-020),
-- so the short `kong` name no longer resolves from the DB pod. NOTE: editing
-- this file only fixes FRESH bring-ups; an already-installed trigger is
-- repointed by the forward migration 20260623000000.
--
-- Reversible: re-point both triggers back to `.../functions/v1/kestra-call`.

drop trigger if exists devices_webhook on public.devices;
create trigger devices_webhook
  after insert
  on public.devices
  for each row
  execute function supabase_functions.http_request(
    'http://kong.supabase-app.svc.cluster.local:8000/functions/v1/netmaker-call',
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
    'http://kong.supabase-app.svc.cluster.local:8000/functions/v1/netmaker-call',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
