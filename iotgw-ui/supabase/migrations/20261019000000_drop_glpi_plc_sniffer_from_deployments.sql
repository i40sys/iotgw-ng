-- Remove the glpi-agent and plc_sniffer stacks from stored deployment configs.
--
-- Both stacks were dropped from the provisioning playbook (iotgw-kestra) and
-- from deployment-config.schema.json. The schema has additionalProperties:
-- false, so a stored config that still carries the GLPI keys would fail
-- validation; strip them, and drop both tags from __tags__.
UPDATE public.deployments
SET configuration = configuration - 'glpi-agent' - 'glpi_agent' - 'glpi_server' - 'glpi_user' - 'glpi_password'
WHERE configuration ?| ARRAY['glpi-agent', 'glpi_agent', 'glpi_server', 'glpi_user', 'glpi_password'];

UPDATE public.deployments
SET configuration = jsonb_set(
  configuration, '{__tags__}',
  COALESCE((SELECT jsonb_agg(t) FROM jsonb_array_elements(configuration -> '__tags__') AS t
            WHERE t NOT IN ('"glpi-agent"'::jsonb, '"plc_sniffer"'::jsonb)), '[]'::jsonb))
WHERE jsonb_typeof(configuration -> '__tags__') = 'array'
  AND configuration -> '__tags__' ?| ARRAY['glpi-agent', 'plc_sniffer'];
