-- Create webhook for devices table
-- This will automatically appear in Supabase Studio under Database → Webhooks
-- because it uses the supabase_functions.http_request function

-- Drop existing trigger if it exists (idempotency)
drop trigger if exists devices_webhook on public.devices;

-- Create the webhook trigger
-- Triggers on INSERT and UPDATE events for devices
create trigger devices_webhook
  after insert or update
  on public.devices
  for each row
  execute function supabase_functions.http_request(
    'http://wsl.ymbihq.local:8000/functions/v1/kestra-call',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
