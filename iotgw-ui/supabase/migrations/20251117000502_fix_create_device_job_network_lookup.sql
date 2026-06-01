-- Fix create_device_job to automatically look up network_name from network_id
-- This ensures network_name is always correct even if caller passes "Unknown" or NULL

create or replace function public.create_device_job(
  p_execution_id text,
  p_flow_id text,
  p_status text,
  p_started_at timestamp with time zone,
  p_device_id uuid,
  p_device_name text,
  p_device_ip_address text,
  p_network_id uuid,
  p_network_name text,
  p_transaction_id uuid default null,
  p_device_description text default null,
  p_created_by uuid default null
)
returns setof public.device_jobs
language plpgsql
security definer
as $$
declare
  v_network_name text;
begin
  -- Look up the network name from the networks table if:
  -- 1. p_network_name is NULL, OR
  -- 2. p_network_name is empty string, OR
  -- 3. p_network_name is 'Unknown', OR
  -- 4. p_network_id is provided
  -- This ensures we always have the correct network name
  if p_network_id is not null and (p_network_name is null or p_network_name = '' or p_network_name = 'Unknown') then
    select name into v_network_name
    from public.networks
    where id = p_network_id;

    -- If we found a network, use it; otherwise keep the provided value
    if v_network_name is not null then
      p_network_name := v_network_name;
    end if;
  end if;

  return query
  insert into public.device_jobs (
    execution_id,
    flow_id,
    status,
    started_at,
    device_id,
    device_name,
    device_ip_address,
    network_id,
    network_name,
    transaction_id,
    device_description,
    created_by
  ) values (
    p_execution_id,
    p_flow_id,
    p_status,
    p_started_at,
    p_device_id,
    p_device_name,
    p_device_ip_address,
    p_network_id,
    p_network_name,
    p_transaction_id,
    p_device_description,
    p_created_by
  )
  returning *;
exception
  when unique_violation then
    raise exception 'Device job with execution_id "%" already exists', p_execution_id
      using errcode = '23505';
  when others then
    raise exception 'Failed to create device job: %', sqlerrm
      using errcode = sqlstate;
end;
$$;
