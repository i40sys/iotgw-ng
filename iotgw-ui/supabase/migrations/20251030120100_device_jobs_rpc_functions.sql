-- RPC functions for device_jobs table operations
-- These functions handle CRUD operations for device execution history

-- ============================================================================
-- Function: create_device_job
-- Description: Creates a new device job record with complete denormalized data
-- Parameters: All device job fields including execution tracking and device snapshots
-- Returns: The created device_jobs record
-- ============================================================================
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
begin
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

-- ============================================================================
-- Function: update_device_job_status
-- Description: Updates only the execution status fields of a device job
-- Parameters: execution_id, status, completed_at (optional), error_message (optional)
-- Returns: The updated device_jobs record
-- ============================================================================
create or replace function public.update_device_job_status(
  p_execution_id text,
  p_status text,
  p_completed_at timestamp with time zone default null,
  p_error_message text default null
)
returns setof public.device_jobs
language plpgsql
security definer
as $$
begin
  return query
  update public.device_jobs
  set
    status = p_status,
    completed_at = coalesce(p_completed_at, completed_at),
    error_message = p_error_message
  where execution_id = p_execution_id
  returning *;

  if not found then
    raise exception 'Device job with execution_id "%" not found', p_execution_id
      using errcode = 'P0002';
  end if;
exception
  when sqlstate 'P0002' then
    raise;
  when others then
    raise exception 'Failed to update device job status: %', sqlerrm
      using errcode = sqlstate;
end;
$$;

-- ============================================================================
-- Function: get_device_jobs
-- Description: Retrieves device jobs with optional filtering and pagination
-- Parameters: device_id (optional), network_id (optional), status (optional), limit (optional), offset (optional)
-- Returns: Array of device_jobs records matching the filters
-- ============================================================================
create or replace function public.get_device_jobs(
  p_device_id uuid default null,
  p_network_id uuid default null,
  p_status text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns setof public.device_jobs
language plpgsql
security definer
as $$
begin
  return query
  select *
  from public.device_jobs
  where
    (p_device_id is null or device_id = p_device_id)
    and (p_network_id is null or network_id = p_network_id)
    and (p_status is null or status = p_status)
  order by started_at desc
  limit p_limit
  offset p_offset;
exception
  when others then
    raise exception 'Failed to retrieve device jobs: %', sqlerrm
      using errcode = sqlstate;
end;
$$;

-- ============================================================================
-- Function: get_device_job_by_execution_id
-- Description: Retrieves a single device job by its Kestra execution ID
-- Parameters: execution_id
-- Returns: The device_jobs record with all snapshot data
-- ============================================================================
create or replace function public.get_device_job_by_execution_id(
  p_execution_id text
)
returns setof public.device_jobs
language plpgsql
security definer
as $$
begin
  return query
  select *
  from public.device_jobs
  where execution_id = p_execution_id;

  if not found then
    raise exception 'Device job with execution_id "%" not found', p_execution_id
      using errcode = 'P0002';
  end if;
exception
  when sqlstate 'P0002' then
    raise;
  when others then
    raise exception 'Failed to retrieve device job: %', sqlerrm
      using errcode = sqlstate;
end;
$$;

-- Grant execute permissions on all RPC functions
grant execute on function public.create_device_job to authenticated;
grant execute on function public.create_device_job to anon;
grant execute on function public.create_device_job to service_role;

grant execute on function public.update_device_job_status to authenticated;
grant execute on function public.update_device_job_status to anon;
grant execute on function public.update_device_job_status to service_role;

grant execute on function public.get_device_jobs to authenticated;
grant execute on function public.get_device_jobs to anon;
grant execute on function public.get_device_jobs to service_role;

grant execute on function public.get_device_job_by_execution_id to authenticated;
grant execute on function public.get_device_job_by_execution_id to anon;
grant execute on function public.get_device_job_by_execution_id to service_role;
