import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "../context";
import type { Operator } from "../auth/operator";

export const t = initTRPC.context<Context>().create();

// decision-034: every procedure requires an authenticated operator. The token
// is verified in createContext (resolveOperatorAuth); this middleware turns the
// result into UNAUTHORIZED (no/invalid/expired token) or FORBIDDEN (valid user
// without an operator role) and exposes ctx.operator = { id, email, role }.
export const operatorMiddleware = t.middleware(({ ctx, next }) => {
  const auth = ctx.auth;
  if (!auth?.ok) {
    throw new TRPCError({
      code: auth?.code ?? "UNAUTHORIZED",
      message:
        auth?.code === "FORBIDDEN"
          ? "Operator role required"
          : "Authentication required",
    });
  }
  return next({
    ctx: {
      ...ctx,
      operator: auth.operator,
    },
  });
});

export const operatorProcedure = t.procedure.use(operatorMiddleware);

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

// Operator-only procedure builder that ensures Supabase is available.
export const supabaseProcedure = operatorProcedure.use(supabaseMiddleware);

/** Context seen by procedure handlers (after the operator middleware). */
export type OperatorContext = Context & { operator: Operator };
