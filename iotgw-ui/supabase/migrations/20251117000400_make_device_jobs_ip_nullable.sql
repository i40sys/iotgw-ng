-- Make device_ip_address nullable in device_jobs table
-- This aligns with the devices table change where ip_address can now be null
-- Devices may not have an IP assigned immediately upon creation

alter table "public"."device_jobs"
  alter column "device_ip_address" drop not null;
