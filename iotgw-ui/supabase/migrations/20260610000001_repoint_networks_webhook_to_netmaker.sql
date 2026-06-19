-- Repoint the networks webhook from the `kestra-call` edge function to
-- `netmaker-call`, which now provisions Netmaker networks directly via the
-- Netmaker REST API (bypassing the Kestra/Ansible hop) — mirroring the device
-- migration in 20260610000000.
--
-- Also adds a DELETE webhook for networks (there was none before, though
-- network_delete.yml existed in Kestra), so network removal is wired for parity
-- with devices. INSERT/UPDATE stays on one trigger; the function does NOT write
-- back to the networks table, so UPDATE is loop-safe.
--
-- The target is the in-cluster `kong` Service DNS (`http://kong:8000`), which
-- also resolves on the legacy supabase compose network — engine-neutral, so a
-- fresh apply reproduces the live k8s state (task-055). The former compose host
-- `http://wsl.ymbihq.local:8000` was host-routed only.
--
-- Reversible: re-point both triggers back to `.../functions/v1/kestra-call`
-- (and drop networks_webhook_delete).

drop trigger if exists networks_webhook on public.networks;
create trigger networks_webhook
  after insert or update
  on public.networks
  for each row
  execute function supabase_functions.http_request(
    'http://kong:8000/functions/v1/netmaker-call',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );

drop trigger if exists networks_webhook_delete on public.networks;
create trigger networks_webhook_delete
  after delete
  on public.networks
  for each row
  execute function supabase_functions.http_request(
    'http://kong:8000/functions/v1/netmaker-call',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
