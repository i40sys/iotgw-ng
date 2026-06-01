import { z } from "zod";
import { logger } from "../logger";
import { TRPCError } from "@trpc/server";
import { createQueryProcedure } from "../utils/query-helper";
import { createMutationProcedure } from "../utils/mutation-helper";

export const domainsRouter = {
  getDomains: createQueryProcedure(
    "get_domains",
    z.object({}).optional(),
    async ({ ctx }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("domains")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        logger.error({ error }, "Error fetching domains from Supabase");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch domains: ${error.message}`,
          cause: error,
        });
      }

      if (!data || data.length === 0) {
        logger.info("No domains found in database");
      } else {
        logger.info(`Successfully fetched ${data.length} domains`);
      }

      return data;
    },
  ),

  getDomain: createQueryProcedure(
    "get_domain",
    z.object({ id: z.string() }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("domains")
        .select("*")
        .eq("id", input.id)
        .single();

      if (error) {
        logger.error({ error }, "Error fetching domain from Supabase");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch domain: ${error.message}`,
          cause: error,
        });
      }

      if (!data) {
        logger.info(`No domain found with ID ${input.id}`);
      } else {
        logger.info(`Successfully fetched domain with ID ${input.id}`);
      }

      return data;
    },
  ),

  getNetworkCounts: createQueryProcedure(
    "get_network_counts",
    z.object({}).optional(),
    async ({ ctx }) => {
      const { supabase } = ctx;

      // Use a join query to efficiently get network counts per domain
      const { data, error } = await supabase.from("domains").select(`
          id,
          networks:networks(count)
        `);

      if (error) {
        logger.error({ error }, "Error fetching network counts from Supabase");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch network counts: ${error.message}`,
          cause: error,
        });
      }

      if (!data) {
        logger.info("No network counts found");
        return {};
      }

      // Transform the result into a map of domain_id -> count
      const networkCounts: Record<string, number> = {};
      data.forEach((domain) => {
        networkCounts[domain.id] = domain.networks?.[0]?.count ?? 0;
      });

      logger.info(
        `Successfully fetched network counts for ${data.length} domains`,
      );
      return networkCounts;
    },
  ),

  createDomain: createMutationProcedure(
    "create_domain",
    z.object({
      name: z.string().min(1, "Domain name is required"),
      display_name: z.string().min(1, "Display name is required"),
    }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("domains")
        .insert({
          name: input.name,
          display_name: input.display_name,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, "Error creating domain");

        // Handle unique constraint violation for domain name
        if (error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Domain with name "${input.name}" already exists`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create domain: ${error.message}`,
          cause: error,
        });
      }

      logger.info(`Successfully created domain "${input.name}"`);
      return data;
    },
  ),

  updateDomain: createMutationProcedure(
    "update_domain",
    z.object({
      id: z.string(),
      name: z.string().min(1, "Domain name is required").optional(),
      display_name: z.string().min(1, "Display name is required").optional(),
    }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      // Build update object with only provided fields
      const updateData: Record<string, string> = {
        updated_at: new Date().toISOString(),
      };

      if (input.name !== undefined) {
        updateData.name = input.name;
      }

      if (input.display_name !== undefined) {
        updateData.display_name = input.display_name;
      }

      const { data, error } = await supabase
        .from("domains")
        .update(updateData)
        .eq("id", input.id)
        .select()
        .single();

      if (error) {
        logger.error({ error }, "Error updating domain");

        // Handle unique constraint violation for domain name
        if (error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Domain with name "${input.name}" already exists`,
            cause: error,
          });
        }

        // Handle not found case
        if (error.code === "PGRST116") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Domain with ID ${input.id} not found`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update domain: ${error.message}`,
          cause: error,
        });
      }

      logger.info(`Successfully updated domain with ID ${input.id}`);
      return data;
    },
  ),

  deleteDomain: createMutationProcedure(
    "delete_domain",
    z.object({ id: z.string() }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("domains")
        .delete()
        .eq("id", input.id)
        .select()
        .single();

      if (error) {
        logger.error({ error }, "Error deleting domain");

        // Handle not found case
        if (error.code === "PGRST116") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Domain with ID ${input.id} not found`,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete domain: ${error.message}`,
          cause: error,
        });
      }

      logger.info(`Successfully deleted domain with ID ${input.id}`);
      return data;
    },
  ),
};
