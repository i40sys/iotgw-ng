-- Add ssh_key_id snapshot field to deployment_jobs
alter table public.deployment_jobs
  add column if not exists ssh_key_id text;

comment on column public.deployment_jobs.ssh_key_id is
  'KMS key reference used for the deployment execution';

create index if not exists idx_deployment_jobs_ssh_key_id
  on public.deployment_jobs (ssh_key_id)
  where ssh_key_id is not null;

-- Replace create_deployment_job RPC with ssh_key_id support
-- Drop old signature to avoid function overloading
DROP FUNCTION IF EXISTS public.create_deployment_job(
  text,
  text,
  text,
  timestamp with time zone,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  uuid,
  text,
  text,
  jsonb,
  uuid
);

create or replace function public.create_deployment_job(
  p_execution_id text,
  p_flow_id text,
  p_status text,
  p_started_at timestamp with time zone,
  p_device_id uuid,
  p_device_name text,
  p_device_description text,
  p_device_ip_address text,
  p_network_id uuid,
  p_network_name text,
  p_network_cidr text,
  p_network_ipv4 text,
  p_network_ipv6 text,
  p_domain_id uuid,
  p_domain_name text,
  p_domain_display_name text,
  p_deployment_id uuid,
  p_deployment_name text,
  p_deployment_version text,
  p_configuration_json jsonb,
  p_ssh_key_id text default null,
  p_created_by uuid default null
)
returns setof public.deployment_jobs
language plpgsql
security definer
as $$
begin
  return query
  insert into public.deployment_jobs (
    execution_id,
    flow_id,
    status,
    started_at,
    device_id,
    device_name,
    device_description,
    device_ip_address,
    ssh_key_id,
    network_id,
    network_name,
    network_cidr,
    network_ipv4,
    network_ipv6,
    domain_id,
    domain_name,
    domain_display_name,
    deployment_id,
    deployment_name,
    deployment_version,
    configuration_json,
    created_by
  ) values (
    p_execution_id,
    p_flow_id,
    p_status,
    p_started_at,
    p_device_id,
    p_device_name,
    p_device_description,
    p_device_ip_address,
    p_ssh_key_id,
    p_network_id,
    p_network_name,
    p_network_cidr,
    p_network_ipv4,
    p_network_ipv6,
    p_domain_id,
    p_domain_name,
    p_domain_display_name,
    p_deployment_id,
    p_deployment_name,
    p_deployment_version,
    p_configuration_json,
    p_created_by
  )
  returning *;
exception
  when unique_violation then
    raise exception 'Deployment job with execution_id "%" already exists', p_execution_id
      using errcode = '23505';
  when others then
    raise exception 'Failed to create deployment job: %', sqlerrm
      using errcode = sqlstate;
end;
$$;

grant execute on function public.create_deployment_job(
  text,
  text,
  text,
  timestamp with time zone,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  uuid,
  text,
  text,
  jsonb,
  text,
  uuid
) to authenticated;

grant execute on function public.create_deployment_job(
  text,
  text,
  text,
  timestamp with time zone,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  uuid,
  text,
  text,
  jsonb,
  text,
  uuid
) to anon;

grant execute on function public.create_deployment_job(
  text,
  text,
  text,
  timestamp with time zone,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  uuid,
  text,
  text,
  jsonb,
  text,
  uuid
) to service_role;
