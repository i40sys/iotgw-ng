-- Update get_network_jobs to include domain information via JOIN
-- This allows the UI to display and filter by domain without changing the network_jobs table schema

-- Drop the existing function first
drop function if exists public.get_network_jobs(uuid, text, integer, integer);

-- Recreate with domain information included
create or replace function public.get_network_jobs(
  p_network_id uuid default null,
  p_status text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  execution_id text,
  flow_id text,
  status text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  error_message text,
  transaction_id uuid,
  network_id uuid,
  network_name text,
  network_cidr text,
  network_ipv4 text,
  network_ipv6 text,
  created_by uuid,
  created_at timestamp with time zone,
  domain_id uuid,
  domain_name text,
  domain_display_name text
)
language plpgsql
security definer
as $$
begin
  return query
  select
    nj.id,
    nj.execution_id,
    nj.flow_id,
    nj.status,
    nj.started_at,
    nj.completed_at,
    nj.error_message,
    nj.transaction_id,
    nj.network_id,
    nj.network_name,
    nj.network_cidr,
    nj.network_ipv4,
    nj.network_ipv6,
    nj.created_by,
    nj.created_at,
    n.domain_id,
    d.name as domain_name,
    d.display_name as domain_display_name
  from public.network_jobs nj
  left join public.networks n on nj.network_id = n.id
  left join public.domains d on n.domain_id = d.id
  where
    (p_network_id is null or nj.network_id = p_network_id)
    and (p_status is null or nj.status = p_status)
  order by nj.started_at desc
  limit p_limit
  offset p_offset;
exception
  when others then
    raise exception 'Failed to retrieve network jobs: %', sqlerrm
      using errcode = sqlstate;
end;
$$;

-- Grant execute permissions
grant execute on function public.get_network_jobs to authenticated;
grant execute on function public.get_network_jobs to anon;
grant execute on function public.get_network_jobs to service_role;

-- Also update get_network_job_by_execution_id to include domain info
drop function if exists public.get_network_job_by_execution_id(text);

create or replace function public.get_network_job_by_execution_id(
  p_execution_id text
)
returns table (
  id uuid,
  execution_id text,
  flow_id text,
  status text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  error_message text,
  transaction_id uuid,
  network_id uuid,
  network_name text,
  network_cidr text,
  network_ipv4 text,
  network_ipv6 text,
  created_by uuid,
  created_at timestamp with time zone,
  domain_id uuid,
  domain_name text,
  domain_display_name text
)
language plpgsql
security definer
as $$
begin
  return query
  select
    nj.id,
    nj.execution_id,
    nj.flow_id,
    nj.status,
    nj.started_at,
    nj.completed_at,
    nj.error_message,
    nj.transaction_id,
    nj.network_id,
    nj.network_name,
    nj.network_cidr,
    nj.network_ipv4,
    nj.network_ipv6,
    nj.created_by,
    nj.created_at,
    n.domain_id,
    d.name as domain_name,
    d.display_name as domain_display_name
  from public.network_jobs nj
  left join public.networks n on nj.network_id = n.id
  left join public.domains d on n.domain_id = d.id
  where nj.execution_id = p_execution_id;

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

-- Grant execute permissions
grant execute on function public.get_network_job_by_execution_id to authenticated;
grant execute on function public.get_network_job_by_execution_id to anon;
grant execute on function public.get_network_job_by_execution_id to service_role;
