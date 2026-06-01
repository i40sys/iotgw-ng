import { z } from "zod";
import { logger } from "../logger";
import { TRPCError } from "@trpc/server";
import { createQueryProcedure } from "../utils/query-helper";
import { createMutationProcedure } from "../utils/mutation-helper";

export const networksRouter = {
  getNetworks: createQueryProcedure(
    "get_networks",
    z.object({}).optional(),
    async ({ ctx }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("networks")
        .select("*, domain:domains(id, name, display_name)")
        .order("created_at", { ascending: false });

      if (error) {
        logger.error({ error }, "Error fetching networks from Supabase");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch networks: ${error.message}`,
          cause: error,
        });
      }

      if (!data || data.length === 0) {
        logger.info("No networks found in database");
      } else {
        logger.info(`Successfully fetched ${data.length} networks`);
      }

      return data;
    },
  ),

  getNetworksByDomain: createQueryProcedure(
    "get_networks_by_domain",
    z.object({ domain_id: z.string() }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("networks")
        .select("*")
        .eq("domain_id", input.domain_id)
        .order("created_at", { ascending: false });

      if (error) {
        logger.error(
          { error },
          "Error fetching networks by domain from Supabase",
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch networks for domain: ${error.message}`,
          cause: error,
        });
      }

      if (!data || data.length === 0) {
        logger.info(`No networks found for domain ID ${input.domain_id}`);
      } else {
        logger.info(
          `Successfully fetched ${data.length} networks for domain ID ${input.domain_id}`,
        );
      }

      return data;
    },
  ),

  getNetwork: createQueryProcedure(
    "get_network",
    z.object({ id: z.string() }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("networks")
        .select("*")
        .eq("id", input.id)
        .single();

      if (error) {
        logger.error({ error }, "Error fetching network from Supabase");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch network: ${error.message}`,
          cause: error,
        });
      }

      if (!data) {
        logger.info(`No network found with ID ${input.id}`);
      } else {
        logger.info(`Successfully fetched network with ID ${input.id}`);
      }

      return data;
    },
  ),

  createNetwork: createMutationProcedure(
    "create_network",
    z
      .object({
        domain_id: z.string().min(1, "Domain ID is required"),
        name: z.string().min(1, "Network name is required"),
        ipv4_cidr: z.string().nullable().optional(),
        ipv6_cidr: z.string().nullable().optional(),
      })
      .refine(
        (data) => {
          // At least one CIDR must be provided
          const hasIpv4 = Boolean(data.ipv4_cidr?.trim());
          const hasIpv6 = Boolean(data.ipv6_cidr?.trim());
          return hasIpv4 || hasIpv6;
        },
        {
          message: "At least one CIDR (IPv4 or IPv6) must be provided",
        },
      ),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("networks")
        .insert({
          domain_id: input.domain_id,
          name: input.name,
          ipv4_cidr: input.ipv4_cidr ?? null,
          ipv6_cidr: input.ipv6_cidr ?? null,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, "Error creating network");

        // Handle foreign key constraint violation for domain_id
        if (error.code === "23503") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Domain with ID "${input.domain_id}" does not exist`,
            cause: error,
          });
        }

        // Handle unique constraint violation for network name within domain
        if (error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Network with name "${input.name}" already exists in this domain`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create network: ${error.message}`,
          cause: error,
        });
      }

      logger.info(
        `Successfully created network "${input.name}" in domain ${input.domain_id}`,
      );
      return data;
    },
  ),

  updateNetwork: createMutationProcedure(
    "update_network",
    z.object({
      id: z.string(),
      domain_id: z.string().min(1, "Domain ID is required").optional(),
      name: z.string().min(1, "Network name is required").optional(),
      ipv4_cidr: z.string().nullable().optional(),
      ipv6_cidr: z.string().nullable().optional(),
    }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      // Build update object with only provided fields
      const updateData: Record<string, string | null> = {
        updated_at: new Date().toISOString(),
      };

      if (input.domain_id !== undefined) {
        updateData.domain_id = input.domain_id;
      }

      if (input.name !== undefined) {
        updateData.name = input.name;
      }

      if (input.ipv4_cidr !== undefined) {
        updateData.ipv4_cidr = input.ipv4_cidr;
      }

      if (input.ipv6_cidr !== undefined) {
        updateData.ipv6_cidr = input.ipv6_cidr;
      }

      // Validate that at least one CIDR will remain after update
      if (input.ipv4_cidr !== undefined || input.ipv6_cidr !== undefined) {
        // Get current network data to check existing values
        const { data: currentNetwork } = await supabase
          .from("networks")
          .select("ipv4_cidr, ipv6_cidr")
          .eq("id", input.id)
          .single();

        if (currentNetwork) {
          const finalIpv4 =
            input.ipv4_cidr !== undefined
              ? input.ipv4_cidr
              : currentNetwork.ipv4_cidr;
          const finalIpv6 =
            input.ipv6_cidr !== undefined
              ? input.ipv6_cidr
              : currentNetwork.ipv6_cidr;

          const hasIpv4 = finalIpv4 && finalIpv4.trim() !== "";
          const hasIpv6 = finalIpv6 && finalIpv6.trim() !== "";

          if (!hasIpv4 && !hasIpv6) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "At least one CIDR (IPv4 or IPv6) must be provided",
            });
          }
        }
      }

      const { data, error } = await supabase
        .from("networks")
        .update(updateData)
        .eq("id", input.id)
        .select()
        .single();

      if (error) {
        logger.error({ error }, "Error updating network");

        // Handle foreign key constraint violation for domain_id
        if (error.code === "23503") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Domain with ID "${input.domain_id}" does not exist`,
            cause: error,
          });
        }

        // Handle unique constraint violation for network name within domain
        if (error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Network with name "${input.name}" already exists in this domain`,
            cause: error,
          });
        }

        // Handle not found case
        if (error.code === "PGRST116") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Network with ID ${input.id} not found`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update network: ${error.message}`,
          cause: error,
        });
      }

      logger.info(`Successfully updated network with ID ${input.id}`);
      return data;
    },
  ),

  deleteNetwork: createMutationProcedure(
    "delete_network",
    z.object({ id: z.string() }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("networks")
        .delete()
        .eq("id", input.id)
        .select()
        .single();

      if (error) {
        logger.error({ error }, "Error deleting network");

        // Handle not found case
        if (error.code === "PGRST116") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Network with ID ${input.id} not found`,
            cause: error,
          });
        }

        // Handle foreign key constraint violations (if network has dependent records)
        if (error.code === "23503") {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Cannot delete network: it is referenced by other records`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete network: ${error.message}`,
          cause: error,
        });
      }

      logger.info(`Successfully deleted network with ID ${input.id}`);
      return data;
    },
  ),

  // Network jobs query procedures
  listNetworkJobs: createQueryProcedure(
    "list_network_jobs",
    z.object({
      network_id: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase.rpc("get_network_jobs", {
        p_network_id: input.network_id ?? undefined,
        p_status: input.status ?? undefined,
        p_limit: input.limit ?? undefined,
        p_offset: input.offset ?? undefined,
      });

      if (error) {
        logger.error({ error }, "Error fetching network jobs");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch network jobs: ${error.message}`,
          cause: error,
        });
      }

      if (!data) {
        logger.info("No network jobs found");
        return [];
      }

      logger.info(`Successfully fetched ${data.length} network jobs`);
      return data;
    },
  ),

  getNetworkJobByExecutionId: createQueryProcedure(
    "get_network_job_by_execution_id",
    z.object({
      execution_id: z.string().min(1, "Execution ID is required"),
    }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase.rpc(
        "get_network_job_by_execution_id",
        {
          p_execution_id: input.execution_id,
        },
      );

      if (error) {
        logger.error({ error }, "Error fetching network job by execution ID");

        // P0002 is the error code from the RPC function when no record is found
        if (error.code === "P0002") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Network job with execution ID ${input.execution_id} not found`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch network job: ${error.message}`,
          cause: error,
        });
      }

      if (!data || data.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Network job with execution ID ${input.execution_id} not found`,
        });
      }

      logger.info(
        `Successfully fetched network job with execution ID ${input.execution_id}`,
      );
      return data[0];
    },
  ),
};
