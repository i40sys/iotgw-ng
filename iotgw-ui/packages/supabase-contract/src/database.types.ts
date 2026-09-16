export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      deployment_jobs: {
        Row: {
          completed_at: string | null
          configuration_json: Json
          created_at: string | null
          created_by: string | null
          deployment_id: string
          deployment_name: string
          deployment_version: string
          device_description: string | null
          device_id: string
          device_ip_address: string
          device_name: string
          domain_display_name: string
          domain_id: string
          domain_name: string
          error_message: string | null
          execution_id: string
          flow_id: string
          id: string
          network_cidr: string | null
          network_id: string
          network_ipv4: string | null
          network_ipv6: string | null
          network_name: string
          ssh_key_id: string | null
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          configuration_json: Json
          created_at?: string | null
          created_by?: string | null
          deployment_id: string
          deployment_name: string
          deployment_version: string
          device_description?: string | null
          device_id: string
          device_ip_address: string
          device_name: string
          domain_display_name: string
          domain_id: string
          domain_name: string
          error_message?: string | null
          execution_id: string
          flow_id: string
          id?: string
          network_cidr?: string | null
          network_id: string
          network_ipv4?: string | null
          network_ipv6?: string | null
          network_name: string
          ssh_key_id?: string | null
          started_at: string
          status: string
        }
        Update: {
          completed_at?: string | null
          configuration_json?: Json
          created_at?: string | null
          created_by?: string | null
          deployment_id?: string
          deployment_name?: string
          deployment_version?: string
          device_description?: string | null
          device_id?: string
          device_ip_address?: string
          device_name?: string
          domain_display_name?: string
          domain_id?: string
          domain_name?: string
          error_message?: string | null
          execution_id?: string
          flow_id?: string
          id?: string
          network_cidr?: string | null
          network_id?: string
          network_ipv4?: string | null
          network_ipv6?: string | null
          network_name?: string
          ssh_key_id?: string | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      deployments: {
        Row: {
          configuration: Json
          created_at: string | null
          created_by: string | null
          description: string | null
          device_id: string
          id: string
          modified_at: string | null
          modified_by: string | null
          name: string
          short: string | null
          version: string
        }
        Insert: {
          configuration: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          device_id: string
          id?: string
          modified_at?: string | null
          modified_by?: string | null
          name: string
          short?: string | null
          version: string
        }
        Update: {
          configuration?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          device_id?: string
          id?: string
          modified_at?: string | null
          modified_by?: string | null
          name?: string
          short?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "deployments_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_creation_log: {
        Row: {
          created_at: string | null
          hostname: string
          id: string
          ip_address: unknown
        }
        Insert: {
          created_at?: string | null
          hostname: string
          id?: string
          ip_address: unknown
        }
        Update: {
          created_at?: string | null
          hostname?: string
          id?: string
          ip_address?: unknown
        }
        Relationships: []
      }
      device_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          device_description: string | null
          device_id: string
          device_ip_address: string | null
          device_name: string
          error_message: string | null
          execution_id: string
          flow_id: string
          id: string
          network_id: string | null
          network_name: string | null
          started_at: string
          status: string
          transaction_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          device_description?: string | null
          device_id: string
          device_ip_address?: string | null
          device_name: string
          error_message?: string | null
          execution_id: string
          flow_id: string
          id?: string
          network_id?: string | null
          network_name?: string | null
          started_at: string
          status: string
          transaction_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          device_description?: string | null
          device_id?: string
          device_ip_address?: string | null
          device_name?: string
          error_message?: string | null
          execution_id?: string
          flow_id?: string
          id?: string
          network_id?: string | null
          network_name?: string | null
          started_at?: string
          status?: string
          transaction_id?: string | null
        }
        Relationships: []
      }
      devices: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          ip_address: string | null
          name: string
          network_id: string
          private_key: string | null
          public_key: string | null
          ssh_ca_enrolled_at: string | null
          ssh_host_cert_serial: string | null
          ssh_host_cert_valid_before: string | null
          ssh_host_fqdn: string | null
          ssh_host_id: string | null
          ssh_host_key_fingerprint: string | null
          ssh_key_id: string | null
          totp_counter: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          ip_address?: string | null
          name: string
          network_id: string
          private_key?: string | null
          public_key?: string | null
          ssh_ca_enrolled_at?: string | null
          ssh_host_cert_serial?: string | null
          ssh_host_cert_valid_before?: string | null
          ssh_host_fqdn?: string | null
          ssh_host_id?: string | null
          ssh_host_key_fingerprint?: string | null
          ssh_key_id?: string | null
          totp_counter?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          ip_address?: string | null
          name?: string
          network_id?: string
          private_key?: string | null
          public_key?: string | null
          ssh_ca_enrolled_at?: string | null
          ssh_host_cert_serial?: string | null
          ssh_host_cert_valid_before?: string | null
          ssh_host_fqdn?: string | null
          ssh_host_id?: string | null
          ssh_host_key_fingerprint?: string | null
          ssh_key_id?: string | null
          totp_counter?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      domains: {
        Row: {
          created_at: string | null
          display_name: string
          id: string
          name: string
          pki_host_ca_id: string | null
          pki_user_ca_id: string | null
          pki_zone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          id?: string
          name: string
          pki_host_ca_id?: string | null
          pki_user_ca_id?: string | null
          pki_zone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          id?: string
          name?: string
          pki_host_ca_id?: string | null
          pki_user_ca_id?: string | null
          pki_zone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      network_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          error_message: string | null
          execution_id: string
          flow_id: string
          id: string
          network_cidr: string | null
          network_id: string
          network_ipv4: string | null
          network_ipv6: string | null
          network_name: string
          started_at: string
          status: string
          transaction_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          execution_id: string
          flow_id: string
          id?: string
          network_cidr?: string | null
          network_id: string
          network_ipv4?: string | null
          network_ipv6?: string | null
          network_name: string
          started_at: string
          status: string
          transaction_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          execution_id?: string
          flow_id?: string
          id?: string
          network_cidr?: string | null
          network_id?: string
          network_ipv4?: string | null
          network_ipv6?: string | null
          network_name?: string
          started_at?: string
          status?: string
          transaction_id?: string | null
        }
        Relationships: []
      }
      networks: {
        Row: {
          created_at: string | null
          domain_id: string
          id: string
          ipv4_cidr: string | null
          ipv6_cidr: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          domain_id: string
          id?: string
          ipv4_cidr?: string | null
          ipv6_cidr?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          domain_id?: string
          id?: string
          ipv4_cidr?: string | null
          ipv6_cidr?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "networks_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      pg_stat_statements: {
        Row: {
          blk_read_time: number | null
          blk_write_time: number | null
          calls: number | null
          dbid: unknown
          jit_emission_count: number | null
          jit_emission_time: number | null
          jit_functions: number | null
          jit_generation_time: number | null
          jit_inlining_count: number | null
          jit_inlining_time: number | null
          jit_optimization_count: number | null
          jit_optimization_time: number | null
          local_blks_dirtied: number | null
          local_blks_hit: number | null
          local_blks_read: number | null
          local_blks_written: number | null
          max_exec_time: number | null
          max_plan_time: number | null
          mean_exec_time: number | null
          mean_plan_time: number | null
          min_exec_time: number | null
          min_plan_time: number | null
          plans: number | null
          query: string | null
          queryid: number | null
          rows: number | null
          shared_blks_dirtied: number | null
          shared_blks_hit: number | null
          shared_blks_read: number | null
          shared_blks_written: number | null
          stddev_exec_time: number | null
          stddev_plan_time: number | null
          temp_blk_read_time: number | null
          temp_blk_write_time: number | null
          temp_blks_read: number | null
          temp_blks_written: number | null
          toplevel: boolean | null
          total_exec_time: number | null
          total_plan_time: number | null
          userid: unknown
          wal_bytes: number | null
          wal_fpi: number | null
          wal_records: number | null
        }
        Relationships: []
      }
      pg_stat_statements_info: {
        Row: {
          dealloc: number | null
          stats_reset: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_deployment_job: {
        Args: {
          p_configuration_json: Json
          p_created_by?: string
          p_deployment_id: string
          p_deployment_name: string
          p_deployment_version: string
          p_device_description: string
          p_device_id: string
          p_device_ip_address: string
          p_device_name: string
          p_domain_display_name: string
          p_domain_id: string
          p_domain_name: string
          p_execution_id: string
          p_flow_id: string
          p_network_cidr: string
          p_network_id: string
          p_network_ipv4: string
          p_network_ipv6: string
          p_network_name: string
          p_ssh_key_id?: string
          p_started_at: string
          p_status: string
        }
        Returns: {
          completed_at: string | null
          configuration_json: Json
          created_at: string | null
          created_by: string | null
          deployment_id: string
          deployment_name: string
          deployment_version: string
          device_description: string | null
          device_id: string
          device_ip_address: string
          device_name: string
          domain_display_name: string
          domain_id: string
          domain_name: string
          error_message: string | null
          execution_id: string
          flow_id: string
          id: string
          network_cidr: string | null
          network_id: string
          network_ipv4: string | null
          network_ipv6: string | null
          network_name: string
          ssh_key_id: string | null
          started_at: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "deployment_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_device_job: {
        Args: {
          p_created_by?: string
          p_device_description?: string
          p_device_id: string
          p_device_ip_address: string
          p_device_name: string
          p_execution_id: string
          p_flow_id: string
          p_network_id: string
          p_network_name: string
          p_started_at: string
          p_status: string
          p_transaction_id?: string
        }
        Returns: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          device_description: string | null
          device_id: string
          device_ip_address: string | null
          device_name: string
          error_message: string | null
          execution_id: string
          flow_id: string
          id: string
          network_id: string | null
          network_name: string | null
          started_at: string
          status: string
          transaction_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "device_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_network_job: {
        Args: {
          p_created_by?: string
          p_execution_id: string
          p_flow_id: string
          p_network_cidr?: string
          p_network_id: string
          p_network_ipv4?: string
          p_network_ipv6?: string
          p_network_name: string
          p_started_at: string
          p_status: string
          p_transaction_id?: string
        }
        Returns: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          error_message: string | null
          execution_id: string
          flow_id: string
          id: string
          network_cidr: string | null
          network_id: string
          network_ipv4: string | null
          network_ipv6: string | null
          network_name: string
          started_at: string
          status: string
          transaction_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "network_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dblink: { Args: { "": string }; Returns: Record<string, unknown>[] }
      dblink_cancel_query: { Args: { "": string }; Returns: string }
      dblink_close: { Args: { "": string }; Returns: string }
      dblink_connect: { Args: { "": string }; Returns: string }
      dblink_connect_u: { Args: { "": string }; Returns: string }
      dblink_current_query: { Args: never; Returns: string }
      dblink_disconnect:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      dblink_error_message: { Args: { "": string }; Returns: string }
      dblink_exec: { Args: { "": string }; Returns: string }
      dblink_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
      dblink_get_connections: { Args: never; Returns: string[] }
      dblink_get_notify:
        | { Args: { conname: string }; Returns: Record<string, unknown>[] }
        | { Args: never; Returns: Record<string, unknown>[] }
      dblink_get_pkey: {
        Args: { "": string }
        Returns: Database["public"]["CompositeTypes"]["dblink_pkey_results"][]
        SetofOptions: {
          from: "*"
          to: "dblink_pkey_results"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dblink_get_result: {
        Args: { "": string }
        Returns: Record<string, unknown>[]
      }
      dblink_is_busy: { Args: { "": string }; Returns: number }
      df: { Args: { path: string }; Returns: string[] }
      get_deployment_job_by_execution_id: {
        Args: { p_execution_id: string }
        Returns: {
          completed_at: string | null
          configuration_json: Json
          created_at: string | null
          created_by: string | null
          deployment_id: string
          deployment_name: string
          deployment_version: string
          device_description: string | null
          device_id: string
          device_ip_address: string
          device_name: string
          domain_display_name: string
          domain_id: string
          domain_name: string
          error_message: string | null
          execution_id: string
          flow_id: string
          id: string
          network_cidr: string | null
          network_id: string
          network_ipv4: string | null
          network_ipv6: string | null
          network_name: string
          ssh_key_id: string | null
          started_at: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "deployment_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_deployment_jobs: {
        Args: {
          p_device_id?: string
          p_limit?: number
          p_offset?: number
          p_status?: string
        }
        Returns: {
          completed_at: string | null
          configuration_json: Json
          created_at: string | null
          created_by: string | null
          deployment_id: string
          deployment_name: string
          deployment_version: string
          device_description: string | null
          device_id: string
          device_ip_address: string
          device_name: string
          domain_display_name: string
          domain_id: string
          domain_name: string
          error_message: string | null
          execution_id: string
          flow_id: string
          id: string
          network_cidr: string | null
          network_id: string
          network_ipv4: string | null
          network_ipv6: string | null
          network_name: string
          ssh_key_id: string | null
          started_at: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "deployment_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_device_job_by_execution_id: {
        Args: { p_execution_id: string }
        Returns: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          device_description: string | null
          device_id: string
          device_ip_address: string | null
          device_name: string
          error_message: string | null
          execution_id: string
          flow_id: string
          id: string
          network_id: string | null
          network_name: string | null
          started_at: string
          status: string
          transaction_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "device_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_device_jobs: {
        Args: {
          p_device_id?: string
          p_limit?: number
          p_network_id?: string
          p_offset?: number
          p_status?: string
        }
        Returns: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          device_description: string | null
          device_id: string
          device_ip_address: string | null
          device_name: string
          error_message: string | null
          execution_id: string
          flow_id: string
          id: string
          network_id: string | null
          network_name: string | null
          started_at: string
          status: string
          transaction_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "device_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_devices: {
        Args: never
        Returns: {
          created_at: string
          hostname: string
          id: string
          ip_address: unknown
          last_seen_at: string
          mac_address: unknown
          os: string
          status: string
        }[]
      }
      get_network_job_by_execution_id: {
        Args: { p_execution_id: string }
        Returns: {
          completed_at: string
          created_at: string
          created_by: string
          domain_display_name: string
          domain_id: string
          domain_name: string
          error_message: string
          execution_id: string
          flow_id: string
          id: string
          network_cidr: string
          network_id: string
          network_ipv4: string
          network_ipv6: string
          network_name: string
          started_at: string
          status: string
          transaction_id: string
        }[]
      }
      get_network_jobs: {
        Args: {
          p_limit?: number
          p_network_id?: string
          p_offset?: number
          p_status?: string
        }
        Returns: {
          completed_at: string
          created_at: string
          created_by: string
          domain_display_name: string
          domain_id: string
          domain_name: string
          error_message: string
          execution_id: string
          flow_id: string
          id: string
          network_cidr: string
          network_id: string
          network_ipv4: string
          network_ipv6: string
          network_name: string
          started_at: string
          status: string
          transaction_id: string
        }[]
      }
      mounts: { Args: never; Returns: string[] }
      pg_stat_statements: {
        Args: { showtext: boolean }
        Returns: Record<string, unknown>[]
      }
      pg_stat_statements_info: { Args: never; Returns: Record<string, unknown> }
      pg_stat_statements_reset: {
        Args: { dbid?: unknown; queryid?: number; userid?: unknown }
        Returns: undefined
      }
      update_deployment_job_status: {
        Args: {
          p_completed_at?: string
          p_error_message?: string
          p_execution_id: string
          p_status: string
        }
        Returns: {
          completed_at: string | null
          configuration_json: Json
          created_at: string | null
          created_by: string | null
          deployment_id: string
          deployment_name: string
          deployment_version: string
          device_description: string | null
          device_id: string
          device_ip_address: string
          device_name: string
          domain_display_name: string
          domain_id: string
          domain_name: string
          error_message: string | null
          execution_id: string
          flow_id: string
          id: string
          network_cidr: string | null
          network_id: string
          network_ipv4: string | null
          network_ipv6: string | null
          network_name: string
          ssh_key_id: string | null
          started_at: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "deployment_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      update_device_job_status: {
        Args: {
          p_completed_at?: string
          p_error_message?: string
          p_execution_id: string
          p_status: string
        }
        Returns: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          device_description: string | null
          device_id: string
          device_ip_address: string | null
          device_name: string
          error_message: string | null
          execution_id: string
          flow_id: string
          id: string
          network_id: string | null
          network_name: string | null
          started_at: string
          status: string
          transaction_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "device_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      update_network_job_status: {
        Args: {
          p_completed_at?: string
          p_error_message?: string
          p_execution_id: string
          p_status: string
        }
        Returns: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          error_message: string | null
          execution_id: string
          flow_id: string
          id: string
          network_cidr: string | null
          network_id: string
          network_ipv4: string | null
          network_ipv6: string | null
          network_name: string
          started_at: string
          status: string
          transaction_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "network_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      dblink_pkey_results: {
        position: number | null
        colname: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

