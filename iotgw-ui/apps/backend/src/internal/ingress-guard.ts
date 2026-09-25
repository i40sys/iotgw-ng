import type { FastifyInstance } from "fastify";

/**
 * decision-034 §6: the /internal/* endpoints (bearer-token service calls from
 * Kestra and the edge functions) are for in-cluster callers only. A request
 * that came through the public ingress carries X-Forwarded-For (ingress-nginx
 * always sets it); in-cluster callers hit the Service directly and do not.
 * Such requests are refused with 403 before any bearer check.
 */
export function registerInternalIngressGuard(server: FastifyInstance): void {
  server.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0];
    if (
      (path === "/internal" || path.startsWith("/internal/")) &&
      request.headers["x-forwarded-for"] !== undefined
    ) {
      request.log.warn(
        { path, forwardedFor: request.headers["x-forwarded-for"] },
        "refused /internal request that came through the ingress",
      );
      return reply
        .code(403)
        .send({ error: "internal endpoints are not reachable through the ingress" });
    }
  });
}
