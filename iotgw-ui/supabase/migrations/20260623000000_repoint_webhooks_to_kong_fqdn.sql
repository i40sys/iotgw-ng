-- Repoint every live pg_net webhook trigger from the short `http://kong:8000`
-- name to the cross-namespace FQDN `http://kong.supabase-app.svc.cluster.local:8000`.
--
-- WHY A NEW MIGRATION: the webhook URL is compiled into the live Postgres TRIGGER
-- definitions (supabase_functions.http_request args) inside the supabase-db pod.
-- pg_net executes the POST from THAT pod. After the namespace split (decision-020)
-- kong lives in `supabase-app` and the DB in `supabase-db`, so the short name
-- `kong:8000` no longer resolves from the DB pod and every webhook would silently
-- fail. Editing the older migration files only fixes a FRESH bring-up; an
-- already-installed trigger keeps its old URL until dropped+recreated here.
--
-- Idempotent: drop-if-exists + create. Covers all five triggers:
--   devices_webhook / devices_webhook_delete  -> netmaker-call
--   networks_webhook / networks_webhook_delete -> netmaker-call
--   deployments_webhook                        -> kestra-dispatch
--
-- Reversible: re-create the triggers with the http://kong:8000 URL.

-- devices --------------------------------------------------------------------
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

-- networks -------------------------------------------------------------------
drop trigger if exists networks_webhook on public.networks;
create trigger networks_webhook
  after insert or update
  on public.networks
  for each row
  execute function supabase_functions.http_request(
    'http://kong.supabase-app.svc.cluster.local:8000/functions/v1/netmaker-call',
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
    'http://kong.supabase-app.svc.cluster.local:8000/functions/v1/netmaker-call',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );

-- deployments ----------------------------------------------------------------
drop trigger if exists deployments_webhook on public.deployments;
create trigger deployments_webhook
  after insert
  on public.deployments
  for each row
  execute function supabase_functions.http_request(
    'http://kong.supabase-app.svc.cluster.local:8000/functions/v1/kestra-dispatch',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
