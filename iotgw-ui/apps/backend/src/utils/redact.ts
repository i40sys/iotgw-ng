import { deploymentConfigJsonSchema } from "../../../../packages/supabase-contract/src/deployment-config.validate";

// Keys whose VALUE must never reach a log line. A deployment configuration can
// hold provisioning secrets (task-130: x-secret fields — root password, OAuth2
// client secrets, EMQX/GLPI/Influx logins, …), so the whole document is
// dropped, and any schema secret key is masked wherever it appears.
const REDACTED = "[redacted]";

const WHOLE_VALUE_KEYS = new Set([
  "configuration",
  "configuration_json",
  "p_configuration_json",
  "json_data",
]);

const SECRET_KEYS = new Set(
  Object.entries(deploymentConfigJsonSchema.properties)
    .filter(([, node]) => node["x-secret"] === true)
    .map(([key]) => key),
);

export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] =
      WHOLE_VALUE_KEYS.has(key) || SECRET_KEYS.has(key) || key === "password"
        ? REDACTED
        : redactForLog(inner, depth + 1);
  }
  return out;
}
