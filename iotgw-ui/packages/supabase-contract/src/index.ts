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
