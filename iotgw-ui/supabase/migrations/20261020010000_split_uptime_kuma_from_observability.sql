-- Split Uptime Kuma out of the observability stack in stored deployment configs.
--
-- Uptime Kuma now has its own tag (`uptime-kuma`) and flag (`uptime_kuma`), and
-- monitors only the gateway's own services, so the third-party monitor fields
-- and the separate Kuma exporter credentials are gone from
-- deployment-config.schema.json (additionalProperties: false).
UPDATE public.deployments
SET configuration = configuration
  - 'kuma_exporter_username' - 'kuma_exporter_password'
  - 'mqtt_username' - 'mqtt_password' - 'mqtt_hostname' - 'mqtt_port'
  - 'factory_mqtt_host' - 'factory_gw_host' - 'iiot_server_host' - 'internet_dns'
  - 'num_maquina' - 'backup_local_dns'
WHERE configuration ?| ARRAY['kuma_exporter_username', 'kuma_exporter_password',
  'mqtt_username', 'mqtt_password', 'mqtt_hostname', 'mqtt_port',
  'factory_mqtt_host', 'factory_gw_host', 'iiot_server_host', 'internet_dns',
  'num_maquina', 'backup_local_dns'];

-- The schema requires the new flag, and the playbook treats an absent flag as
-- enabled; keep Uptime Kuma off until an operator turns it on.
UPDATE public.deployments
SET configuration = configuration || '{"uptime_kuma": false}'::jsonb
WHERE configuration ? 'obs' AND NOT configuration ? 'uptime_kuma';
