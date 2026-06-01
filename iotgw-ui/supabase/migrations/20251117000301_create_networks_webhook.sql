-- Create webhook for networks table
-- This will automatically appear in Supabase Studio under Database → Webhooks
-- because it uses the supabase_functions.http_request function

-- Drop existing trigger if it exists (idempotency)
drop trigger if exists networks_webhook on public.networks;

-- Create the webhook trigger
-- Triggers on INSERT and UPDATE events for networks
create trigger networks_webhook
  after insert or update
  on public.networks
  for each row
  execute function supabase_functions.http_request(
    'http://wsl.ymbihq.local:8000/functions/v1/kestra-call',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
