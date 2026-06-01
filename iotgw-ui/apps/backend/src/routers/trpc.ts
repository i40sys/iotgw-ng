import { initTRPC } from "@trpc/server";
import type { Context } from "../context";

export const t = initTRPC.context<Context>().create();

// Middleware to ensure Supabase client is available
export const supabaseMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.supabase) {
    throw new Error("Supabase client not available in context");
  }
  return next({
    ctx: {
      ...ctx,
      supabase: ctx.supabase,
    },
  });
});

// Create a tRPC procedure builder that ensures Supabase is available
export const supabaseProcedure = t.procedure.use(supabaseMiddleware);
