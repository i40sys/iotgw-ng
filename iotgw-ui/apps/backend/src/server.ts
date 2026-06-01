import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import fastify from "fastify";
import { createContext } from "./context";
import { appRouter, type AppRouter } from "./routers/router";
import ws from "@fastify/websocket";
import cors from "@fastify/cors";
import envToLogger from "./logger";

const environment = (process.env.NODE_ENV ?? "development") as
  | "development"
  | "production"
  | "test";

const server = fastify({
  maxParamLength: 5000,
  logger: envToLogger[environment],
});

void server.register(cors);

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

void (async () => {
  try {
    await server.listen({ port: 4444, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
})();
