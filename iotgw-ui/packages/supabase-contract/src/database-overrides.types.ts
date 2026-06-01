import type { Database as GeneratedDatabase } from "./database.types";

/**
 * Override database types to handle PostgreSQL types that Supabase doesn't properly convert
 * - inet -> string (IP addresses)
 * - macaddr -> string (MAC addresses)
 */
export type Database = {
  public: {
    Tables: {
      device_creation_log: Omit<
        GeneratedDatabase["public"]["Tables"]["device_creation_log"],
        "Row" | "Insert" | "Update"
      > & {
        Row: Omit<
          GeneratedDatabase["public"]["Tables"]["device_creation_log"]["Row"],
          "ip_address"
        > & {
          ip_address: string | null;
        };
        Insert: Omit<
          GeneratedDatabase["public"]["Tables"]["device_creation_log"]["Insert"],
          "ip_address"
        > & {
          ip_address?: string | null;
        };
        Update: Omit<
          GeneratedDatabase["public"]["Tables"]["device_creation_log"]["Update"],
          "ip_address"
        > & {
          ip_address?: string | null;
        };
      };
      devices: GeneratedDatabase["public"]["Tables"]["devices"];
      domains: GeneratedDatabase["public"]["Tables"]["domains"];
      networks: GeneratedDatabase["public"]["Tables"]["networks"];
      deployment_jobs: GeneratedDatabase["public"]["Tables"]["deployment_jobs"];
      deployments: GeneratedDatabase["public"]["Tables"]["deployments"];
      device_jobs: GeneratedDatabase["public"]["Tables"]["device_jobs"];
      network_jobs: GeneratedDatabase["public"]["Tables"]["network_jobs"];
    };
    Views: GeneratedDatabase["public"]["Views"];
    Functions: GeneratedDatabase["public"]["Functions"];
    Enums: GeneratedDatabase["public"]["Enums"];
    CompositeTypes: GeneratedDatabase["public"]["CompositeTypes"];
  };
};

// Re-export the utility types with proper typing
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
