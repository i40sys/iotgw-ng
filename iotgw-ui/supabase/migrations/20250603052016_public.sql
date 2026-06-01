create table "public"."device_creation_log" (
    "id" uuid not null default gen_random_uuid(),
    "hostname" character varying(255) not null,
    "ip_address" inet not null,
    "created_at" timestamp with time zone default now()
);


alter table "public"."device_creation_log" enable row level security;

create table "public"."devices" (
    "id" uuid not null default gen_random_uuid(),
    "hostname" text,
    "ip_address" inet,
    "mac_address" macaddr,
    "os" text,
    "status" text default 'unknown'::text,
    "last_seen_at" timestamp with time zone default now(),
    "created_at" timestamp with time zone default now()
);


CREATE UNIQUE INDEX device_creation_log_pkey ON public.device_creation_log USING btree (id);

CREATE UNIQUE INDEX devices_pkey ON public.devices USING btree (id);

CREATE INDEX idx_device_creation_log_ip_address ON public.device_creation_log USING btree (ip_address);

CREATE INDEX idx_devices_ip_address ON public.devices USING btree (ip_address);

CREATE INDEX idx_devices_last_seen_at ON public.devices USING btree (last_seen_at);

alter table "public"."device_creation_log" add constraint "device_creation_log_pkey" PRIMARY KEY using index "device_creation_log_pkey";

alter table "public"."devices" add constraint "devices_pkey" PRIMARY KEY using index "devices_pkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_devices()
 RETURNS TABLE(id uuid, hostname text, ip_address inet, mac_address macaddr, os text, status text, last_seen_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN 
  RETURN QUERY
  SELECT
    d.id,
    d.hostname,
    d.ip_address,
    d.mac_address,
    d.os,
    d.status,
    d.last_seen_at,
    d.created_at
  FROM
    devices d
  ORDER BY
    d.last_seen_at DESC;
END;
$function$
;

grant delete on table "public"."device_creation_log" to "anon";

grant insert on table "public"."device_creation_log" to "anon";

grant references on table "public"."device_creation_log" to "anon";

grant select on table "public"."device_creation_log" to "anon";

grant trigger on table "public"."device_creation_log" to "anon";

grant truncate on table "public"."device_creation_log" to "anon";

grant update on table "public"."device_creation_log" to "anon";

grant delete on table "public"."device_creation_log" to "authenticated";

grant insert on table "public"."device_creation_log" to "authenticated";

grant references on table "public"."device_creation_log" to "authenticated";

grant select on table "public"."device_creation_log" to "authenticated";

grant trigger on table "public"."device_creation_log" to "authenticated";

grant truncate on table "public"."device_creation_log" to "authenticated";

grant update on table "public"."device_creation_log" to "authenticated";

grant delete on table "public"."device_creation_log" to "postgres";

grant insert on table "public"."device_creation_log" to "postgres";

grant references on table "public"."device_creation_log" to "postgres";

grant select on table "public"."device_creation_log" to "postgres";

grant trigger on table "public"."device_creation_log" to "postgres";

grant truncate on table "public"."device_creation_log" to "postgres";

grant update on table "public"."device_creation_log" to "postgres";

grant delete on table "public"."device_creation_log" to "service_role";

grant insert on table "public"."device_creation_log" to "service_role";

grant references on table "public"."device_creation_log" to "service_role";

grant select on table "public"."device_creation_log" to "service_role";

grant trigger on table "public"."device_creation_log" to "service_role";

grant truncate on table "public"."device_creation_log" to "service_role";

grant update on table "public"."device_creation_log" to "service_role";

grant delete on table "public"."devices" to "anon";

grant insert on table "public"."devices" to "anon";

grant references on table "public"."devices" to "anon";

grant select on table "public"."devices" to "anon";

grant trigger on table "public"."devices" to "anon";

grant truncate on table "public"."devices" to "anon";

grant update on table "public"."devices" to "anon";

grant delete on table "public"."devices" to "authenticated";

grant insert on table "public"."devices" to "authenticated";

grant references on table "public"."devices" to "authenticated";

grant select on table "public"."devices" to "authenticated";

grant trigger on table "public"."devices" to "authenticated";

grant truncate on table "public"."devices" to "authenticated";

grant update on table "public"."devices" to "authenticated";

grant delete on table "public"."devices" to "postgres";

grant insert on table "public"."devices" to "postgres";

grant references on table "public"."devices" to "postgres";

grant select on table "public"."devices" to "postgres";

grant trigger on table "public"."devices" to "postgres";

grant truncate on table "public"."devices" to "postgres";

grant update on table "public"."devices" to "postgres";

grant delete on table "public"."devices" to "service_role";

grant insert on table "public"."devices" to "service_role";

grant references on table "public"."devices" to "service_role";

grant select on table "public"."devices" to "service_role";

grant trigger on table "public"."devices" to "service_role";

grant truncate on table "public"."devices" to "service_role";

grant update on table "public"."devices" to "service_role";

create policy "Allow authenticated users to manage device logs"
on "public"."device_creation_log"
as permissive
for all
to authenticated
using (true)
with check (true);


create policy "Allow authenticated users to read devices"
on "public"."devices"
as permissive
for select
to authenticated
using (true);
