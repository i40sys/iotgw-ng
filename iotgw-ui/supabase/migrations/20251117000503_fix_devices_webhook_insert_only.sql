-- Fix devices webhook to only trigger on INSERT, not UPDATE
-- This prevents infinite loops where Kestra updates trigger more webhooks

-- Drop existing trigger
drop trigger if exists devices_webhook on public.devices;

-- Create the webhook trigger for INSERT only
-- This ensures we only create a job when a new device is added, not on every update
create trigger devices_webhook
  after insert
  on public.devices
  for each row
  execute function supabase_functions.http_request(
    'http://wsl.ymbihq.local:8000/functions/v1/kestra-call',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
