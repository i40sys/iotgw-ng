import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import fastify from "fastify";
import { createContext, supabase } from "./context";
import { appRouter, type AppRouter } from "./routers/router";
import ws from "@fastify/websocket";
import cors from "@fastify/cors";
import envToLogger from "./logger";
import { issueOpsUserCert, isPkiConfigured } from "./services/pki";
import { registerDeviceCodeRoutes } from "./internal/device-code-routes";
import { registerInternalIngressGuard } from "./internal/ingress-guard";

const environment = (process.env.NODE_ENV ?? "development") as
  | "development"
  | "production"
  | "test";

const server = fastify({
  maxParamLength: 5000,
  logger: envToLogger[environment],
});

void server.register(cors);

// decision-034: /internal/* is in-cluster only — refuse anything that came
// through the ingress (X-Forwarded-For) before the route's bearer check.
registerInternalIngressGuard(server);

server.register(fastifyTRPCPlugin, {
  trpcOptions: {
    router: appRouter,
    createContext,
    onError({ path, error }) {
      // report to error monitoring
      server.log.error(
        { path, error },
        `Error in tRPC handler on path '${path}'`,
      );
    },
  } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
  useWss: true,
  keepAlive: {
    enabled: true,
    pingMs: 30000,
    pongWaitMs: 5000,
  },
});

server.register(ws);

// Internal mint endpoint for the Kestra runner's short-lived iotgw-ops user
// certificate (task-092, decision-028 §1). The pod generates an EPHEMERAL keypair
// and sends only its public key; the backend signs it via pki-manager with its
// OIDC credential, so no sign-user credential ever lands in the pod. Guarded by a
// shared bearer (OPS_CERT_MINT_TOKEN) and reachable only from the kestra namespace
// (NetworkPolicy). NOT a tRPC procedure on purpose — the runner pod calls it with
// plain curl/wget from bash.
server.post<{
  Body: { zone?: string; sshPublicKey?: string };
}>("/internal/ssh/ops-cert", async (request, reply) => {
  const expected = process.env.OPS_CERT_MINT_TOKEN;
  if (!expected) {
    return reply.code(503).send({ error: "ops-cert minting is not configured" });
  }
  const auth = request.headers.authorization ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (presented !== expected) {
    return reply.code(401).send({ error: "unauthorized" });
  }
  if (!isPkiConfigured()) {
    return reply.code(503).send({ error: "pki-manager is not configured" });
  }
  const { zone, sshPublicKey } = request.body ?? {};
  if (!zone || !sshPublicKey) {
    return reply
      .code(400)
      .send({ error: "zone and sshPublicKey are required" });
  }
  try {
    const certificate = await issueOpsUserCert(zone, sshPublicKey);
    return reply.send({ certificate });
  } catch (err) {
    request.log.error({ err, zone }, "ops-cert minting failed");
    const message = err instanceof Error ? err.message : "minting failed";
    return reply.code(502).send({ error: message });
  }
});

// Device one-time-code endpoints (decision-033): code candidates for the vpn /
// ssh-ca edge functions (DEVICE_AUTH_TOKEN) and the first-enrollment code for
// Kestra provisioning (OPS_CERT_MINT_TOKEN). The seed never leaves the backend.
registerDeviceCodeRoutes(server, { supabase });

void (async () => {
  try {
    await server.listen({ port: Number(process.env.PORT) || 4444, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
})();
