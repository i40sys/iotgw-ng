-- Remove the credentials stack from stored deployment configs.
--
-- The stack (it wrote /etc/config/credentials with the GHCR PAT and the
-- Notion API key) was dropped from the provisioning playbook (iotgw-kestra)
-- and from deployment-config.schema.json, whose additionalProperties: false
-- would reject a stored config that still carries its keys.
UPDATE public.deployments
SET configuration = configuration - 'credentials' - 'ghcr_pat' - 'notion_api_key'
WHERE configuration ?| ARRAY['credentials', 'ghcr_pat', 'notion_api_key'];

UPDATE public.deployments
SET configuration = jsonb_set(
  configuration, '{__tags__}',
  COALESCE((SELECT jsonb_agg(t) FROM jsonb_array_elements(configuration -> '__tags__') AS t
            WHERE t <> '"credentials"'::jsonb), '[]'::jsonb))
WHERE jsonb_typeof(configuration -> '__tags__') = 'array'
  AND configuration -> '__tags__' ? 'credentials';
