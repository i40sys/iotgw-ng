-- Create webhook trigger for the deployments table (INSERT only).
--
-- This fires the kestra-dispatch edge function when a new deployment row is
-- inserted. INSERT-only to avoid trigger loops (the function never UPDATEs
-- the deployments table, but guarding here is belt-and-suspenders).
--
-- The target URL uses the in-cluster Kong Service so the trigger works
-- both in kind and (once TASK-055 is complete) against the StackGres cluster.
-- TASK-055 will re-point this to the in-cluster URL if the DB itself moves.
--
-- Related: decision-016 §6, task-062.18

drop trigger if exists deployments_webhook on public.deployments;

create trigger deployments_webhook
  after insert on public.deployments
  for each row
  execute function supabase_functions.http_request(
    'http://kong:8000/functions/v1/kestra-dispatch',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
