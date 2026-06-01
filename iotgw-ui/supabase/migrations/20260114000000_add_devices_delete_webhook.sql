-- Add DELETE trigger for devices table
-- This triggers the Kestra workflow to delete the device from Netmaker

-- Create a separate trigger for DELETE operations
-- We keep INSERT separate to avoid issues with the payload format
create trigger devices_webhook_delete
  after delete
  on public.devices
  for each row
  execute function supabase_functions.http_request(
    'http://wsl.ymbihq.local:8000/functions/v1/kestra-call',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
