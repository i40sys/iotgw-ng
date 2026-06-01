-- RPC functions for network_jobs table operations
-- These functions handle CRUD operations for network execution history

-- ============================================================================
-- Function: create_network_job
-- Description: Creates a new network job record with complete denormalized data
-- Parameters: All network job fields including execution tracking and network snapshots
-- Returns: The created network_jobs record
-- ============================================================================
create or replace function public.create_network_job(
  p_execution_id text,
  p_flow_id text,
  p_status text,
  p_started_at timestamp with time zone,
  p_network_id uuid,
  p_network_name text,
  p_transaction_id uuid default null,
  p_network_cidr text default null,
  p_network_ipv4 text default null,
  p_network_ipv6 text default null,
  p_created_by uuid default null
)
returns setof public.network_jobs
language plpgsql
security definer
as $$
begin
  return query
  insert into public.network_jobs (
    execution_id,
    flow_id,
    status,
    started_at,
    network_id,
    network_name,
    transaction_id,
    network_cidr,
    network_ipv4,
    network_ipv6,
    created_by
  ) values (
    p_execution_id,
    p_flow_id,
    p_status,
    p_started_at,
    p_network_id,
    p_network_name,
    p_transaction_id,
    p_network_cidr,
    p_network_ipv4,
    p_network_ipv6,
    p_created_by
  )
  returning *;
exception
  when unique_violation then
    raise exception 'Network job with execution_id "%" already exists', p_execution_id
      using errcode = '23505';
  when others then
    raise exception 'Failed to create network job: %', sqlerrm
      using errcode = sqlstate;
end;
$$;

-- ============================================================================
-- Function: update_network_job_status
-- Description: Updates only the execution status fields of a network job
-- Parameters: execution_id, status, completed_at (optional), error_message (optional)
-- Returns: The updated network_jobs record
-- ============================================================================
create or replace function public.update_network_job_status(
  p_execution_id text,
  p_status text,
  p_completed_at timestamp with time zone default null,
  p_error_message text default null
)
returns setof public.network_jobs
language plpgsql
security definer
as $$
begin
  return query
  update public.network_jobs
  set
    status = p_status,
    completed_at = coalesce(p_completed_at, completed_at),
    error_message = p_error_message
  where execution_id = p_execution_id
  returning *;

  if not found then
    raise exception 'Network job with execution_id "%" not found', p_execution_id
      using errcode = 'P0002';
  end if;
exception
  when sqlstate 'P0002' then
    raise;
  when others then
    raise exception 'Failed to update network job status: %', sqlerrm
      using errcode = sqlstate;
end;
$$;

-- ============================================================================
-- Function: get_network_jobs
-- Description: Retrieves network jobs with optional filtering and pagination
-- Parameters: network_id (optional), status (optional), limit (optional), offset (optional)
-- Returns: Array of network_jobs records matching the filters
-- ============================================================================
create or replace function public.get_network_jobs(
  p_network_id uuid default null,
  p_status text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns setof public.network_jobs
language plpgsql
security definer
as $$
begin
  return query
  select *
  from public.network_jobs
  where
    (p_network_id is null or network_id = p_network_id)
    and (p_status is null or status = p_status)
  order by started_at desc
  limit p_limit
  offset p_offset;
exception
  when others then
    raise exception 'Failed to retrieve network jobs: %', sqlerrm
      using errcode = sqlstate;
end;
$$;

-- ============================================================================
-- Function: get_network_job_by_execution_id
-- Description: Retrieves a single network job by its Kestra execution ID
-- Parameters: execution_id
-- Returns: The network_jobs record with all snapshot data
-- ============================================================================
create or replace function public.get_network_job_by_execution_id(
  p_execution_id text
)
returns setof public.network_jobs
language plpgsql
security definer
as $$
begin
  return query
  select *
  from public.network_jobs
  where execution_id = p_execution_id;

  if not found then
    raise exception 'Network job with execution_id "%" not found', p_execution_id
      using errcode = 'P0002';
  end if;
exception
  when sqlstate 'P0002' then
    raise;
  when others then
    raise exception 'Failed to retrieve network job: %', sqlerrm
      using errcode = sqlstate;
end;
$$;

-- Grant execute permissions on all RPC functions
grant execute on function public.create_network_job to authenticated;
grant execute on function public.create_network_job to anon;
grant execute on function public.create_network_job to service_role;

grant execute on function public.update_network_job_status to authenticated;
grant execute on function public.update_network_job_status to anon;
grant execute on function public.update_network_job_status to service_role;

grant execute on function public.get_network_jobs to authenticated;
grant execute on function public.get_network_jobs to anon;
grant execute on function public.get_network_jobs to service_role;

grant execute on function public.get_network_job_by_execution_id to authenticated;
grant execute on function public.get_network_job_by_execution_id to anon;
grant execute on function public.get_network_job_by_execution_id to service_role;
