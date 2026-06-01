-- Make network fields nullable in device_jobs table
-- Devices may not belong to a network, so network_id and network_name should be optional

-- Step 1: Make network_id nullable
ALTER TABLE public.device_jobs
ALTER COLUMN network_id DROP NOT NULL;

-- Step 2: Make network_name nullable
ALTER TABLE public.device_jobs
ALTER COLUMN network_name DROP NOT NULL;

-- Step 3: Update existing "Unknown" network names to NULL (now that column is nullable)
UPDATE public.device_jobs
SET network_name = NULL
WHERE network_name = 'Unknown';
