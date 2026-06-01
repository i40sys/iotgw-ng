-- Backfill network_name in device_jobs from network_id
-- The device_jobs table has network_id but network_name was not properly populated
-- This migration looks up the network name from the networks table using the network_id

UPDATE public.device_jobs dj
SET network_name = n.name
FROM public.networks n
WHERE dj.network_id = n.id
  AND (dj.network_name IS NULL OR dj.network_name = '');

-- Log the result
DO $$
DECLARE
  updated_count integer;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % device_jobs records with network names from network_id lookup', updated_count;
END $$;
