import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../logger";
import { TRPCError } from "@trpc/server";
import { createQueryProcedure } from "../utils/query-helper";
import { createMutationProcedure } from "../utils/mutation-helper";
import {
  ensureDomainPkiZone,
  isPkiConfigured,
  type DomainZoneLink,
} from "../services/pki";

interface DomainRow {
  id: string;
  name: string;
  display_name: string;
  pki_zone: string | null;
}

/**
 * Provision (idempotently) the domain's pki-manager zone + CAs + principals and
 * persist the references on the row (task-080). Resumable: a re-run completes a
 * partially-provisioned zone rather than duplicating. Passes the domain's
 * existing `pki_zone` so a hand-linked zone (e.g. `iotgw-lab`) is reused, not
 * cloned. Returns the persisted references.
 */
async function linkDomainToPkiZone(
  supabase: SupabaseClient,
  domain: DomainRow,
): Promise<DomainZoneLink> {
  const link = await ensureDomainPkiZone({
    domainSlug: domain.name,
    displayName: domain.display_name,
    existingZone: domain.pki_zone,
  });

  const { error } = await supabase
    .from("domains")
    .update({
      pki_zone: link.pki_zone,
      pki_user_ca_id: link.pki_user_ca_id,
      pki_host_ca_id: link.pki_host_ca_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", domain.id);

  if (error) {
    // The zone/CAs exist in pki-manager but we failed to record the ids. Surface
    // it — a re-run of provisionPkiZone will re-detect and persist (AC#4).
    throw new Error(
      `pki-manager zone provisioned but persisting ids on domain ${domain.id} failed: ${error.message}`,
    );
  }
  return link;
}

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

      // Provision the pki-manager zone best-effort (decision-026 phase 0,
      // task-080), mirroring how createDevice mints the KMS SSH key: a PKI
      // failure leaves the domain UNLINKED (enrollment then fails closed,
      // task-079) rather than failing domain creation. Retry via provisionPkiZone.
      if (isPkiConfigured()) {
        try {
          const link = await linkDomainToPkiZone(supabase, data as DomainRow);
          return { ...data, ...link };
        } catch (pkiError) {
          logger.error(
            { pkiError, domainId: data.id },
            `Domain "${input.name}" created but pki-manager zone provisioning failed — ` +
              `left unlinked; retry with provisionPkiZone`,
          );
        }
      } else {
        logger.warn(
          "pki-manager is not configured; domain created without a pki zone (enrollment will fail closed)",
        );
      }
      return data;
    },
  ),

  // Create/complete the pki-manager zone for an existing domain (task-080).
  // Idempotent + resumable: safe to backfill the pre-existing domains and to
  // retry after a partial failure. Unlike createDomain this SURFACES errors, so
  // an operator-triggered backfill reports what went wrong.
  provisionPkiZone: createMutationProcedure(
    "provision_pki_zone",
    z.object({ id: z.string() }),
    async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data: domain, error } = await supabase
        .from("domains")
        .select("id,name,display_name,pki_zone")
        .eq("id", input.id)
        .single();

      if (error || !domain) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Domain with ID ${input.id} not found`,
          cause: error,
        });
      }

      try {
        return await linkDomainToPkiZone(supabase, domain as DomainRow);
      } catch (pkiError) {
        logger.error({ pkiError, domainId: input.id }, "provisionPkiZone failed");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to provision pki-manager zone: ${
            pkiError instanceof Error ? pkiError.message : String(pkiError)
          }`,
          cause: pkiError,
        });
      }
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
