// Database types generated from Supabase (excluding Database type which we override)
export type { Json, CompositeTypes, Enums } from "./database.types";

// Database type overrides for proper typing of inet/macaddr fields
export type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "./database-overrides.types";

// For backward compatibility, also export the overridden Database as DatabaseWithOverrides
export type { Database as DatabaseWithOverrides } from "./database-overrides.types";

// Domain-specific types
export * from "./devices.types";
export * from "./domain.types";
export * from "./network.types";

// Deployment configuration contract (task-130): the ONE JSON Schema (draft
// 2020-12) the UI wizard renders per step (`x-step`) and section (`x-group`),
// and that the Kestra provisioning playbook enforces (iotgw-kestra
// tasks/preflight.yaml). `x-secret` fields must be masked and never logged.
export { default as deploymentConfigSchema } from "./deployment-config.schema.json";
