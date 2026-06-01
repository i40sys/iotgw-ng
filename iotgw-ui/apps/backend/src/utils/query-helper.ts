import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { logger } from "../logger";
import type { Context } from "../context";
import { supabaseProcedure } from "../routers/trpc";

// Helper for defining input types for handlers
export interface HandlerInput<T> {
  input: T;
  ctx: Context;
}

/**
 * Helper function to create a standardized query procedure
 * for Supabase operations with error handling
 *
 * @param functionName Name of the function/operation for logging
 * @param inputSchema Zod schema for validating the input
 * @param handler The function that handles the actual query logic
 * @returns A tRPC procedure that can be used in a router
 */
export const createQueryProcedure = <T extends z.ZodType<unknown>, TOutput>(
  functionName: string,
  inputSchema: T,
  handler: (opts: HandlerInput<z.infer<T>>) => Promise<TOutput>,
) => {
  const procedure = supabaseProcedure.input(inputSchema);

  return procedure.query(async (opts) => {
    try {
      // Call the handler with the correct typing
      return await handler({
        input: opts.input as z.infer<T>,
        ctx: opts.ctx,
      });
    } catch (error) {
      logger.error(
        { error, functionName, input: opts.input },
        "Error in query procedure",
      );

      // Convert to TRPCError for better client-side handling
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Error in ${functionName}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        cause: error,
      });
    }
  });
};
