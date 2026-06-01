-- Create trigger to automatically lookup network_name on device_jobs insert/update
-- This ensures network_name is always correct regardless of how the record is inserted

-- Create the trigger function
CREATE OR REPLACE FUNCTION public.fix_device_jobs_network_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If network_name is NULL, empty, or 'Unknown', look it up from networks table
  IF NEW.network_id IS NOT NULL AND
     (NEW.network_name IS NULL OR NEW.network_name = '' OR NEW.network_name = 'Unknown') THEN

    SELECT name INTO NEW.network_name
    FROM public.networks
    WHERE id = NEW.network_id;

    -- If we couldn't find the network, keep the original value
    -- (this shouldn't happen if foreign key constraints are in place)

  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger on device_jobs table
DROP TRIGGER IF EXISTS fix_network_name_before_insert ON public.device_jobs;

CREATE TRIGGER fix_network_name_before_insert
  BEFORE INSERT OR UPDATE
  ON public.device_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.fix_device_jobs_network_name();

-- Grant execute permission on the trigger function
GRANT EXECUTE ON FUNCTION public.fix_device_jobs_network_name() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fix_device_jobs_network_name() TO anon;
GRANT EXECUTE ON FUNCTION public.fix_device_jobs_network_name() TO service_role;
