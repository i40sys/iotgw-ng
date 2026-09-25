import { type CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";
import { resolveOperatorAuth } from "./auth/operator";
// Import shared contract types with overrides for inet/macaddr
import type { Database } from "@iotgw/supabase-contract";

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
// Service role key is required for backend operations to bypass RLS
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  logger.error(
    "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.",
  );
  logger.error(
    "Note: SUPABASE_SERVICE_KEY is required for backend operations as RLS policies only allow authenticated users.",
  );
  process.exit(1); // Exit the process if credentials are missing
}

// Create a single instance of the Supabase client to reuse in context
export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// Verify connection
try {
  const { error } = await supabase.auth.getSession();
  if (error) {
    logger.error({ error }, "Failed to connect to Supabase");
    throw error;
  }
  logger.info("Successfully connected to Supabase");
} catch (error) {
  logger.error({ error }, "Error initializing Supabase client");
  process.exit(1);
}

// decision-034: every tRPC procedure requires an operator. Without the signing
// secret no token can be verified, so every call is refused (fail closed).
if (!process.env.JWT_SECRET) {
  logger.error(
    "JWT_SECRET is not set — every tRPC call will be rejected as UNAUTHORIZED (decision-034).",
  );
}

export function createContext({ req, res, info }: CreateFastifyContextOptions) {
  const user = { name: req.headers.username ?? "anonymous" };
  // HTTP: Authorization header. WebSocket: connectionParams.token.
  const auth = resolveOperatorAuth({
    authorization: req.headers.authorization,
    connectionParams: info?.connectionParams,
  });

  return { req, res, user, supabase, auth };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
