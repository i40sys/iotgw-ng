-- Backfill network_name in device_jobs table from networks table
-- This migration updates existing device_jobs records that have network_id but missing or incorrect network_name

-- Update device_jobs with network_name from networks table
UPDATE public.device_jobs dj
SET network_name = n.name
FROM public.networks n
WHERE dj.network_id = n.id
  AND (dj.network_name IS NULL OR dj.network_name = '' OR dj.network_name = 'Unknown');

-- Log the number of updated records
DO $$
DECLARE
  updated_count integer;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % device_jobs records with network names', updated_count;
END $$;
