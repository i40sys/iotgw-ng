import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@iotgw/supabase-contract";
import {
  DeviceNotFoundError,
  NoEnrollCodeError,
  getCodeCandidates,
  getEnrollCode,
  resolveDeviceUuid,
} from "../services/device-code";

/**
 * Internal (non-tRPC) endpoints of decision-033:
 *
 *  - POST /internal/device-auth/candidates — bearer DEVICE_AUTH_TOKEN. The `vpn`
 *    and `ssh-ca` edge functions get the codes valid right now (never the seed)
 *    plus the device's lock state.
 *  - POST /internal/devices/enroll-code — bearer OPS_CERT_MINT_TOKEN (the
 *    existing Kestra→backend credential). One code for the first SSH enrollment
 *    during provisioning.
 */

/** Constant-time bearer check. Compares SHA-256 digests so lengths never leak. */
export function bearerMatches(
  header: string | undefined,
  expected: string,
): boolean {
  const presented = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = crypto.createHash("sha256").update(presented).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b) && presented.length > 0;
}

/** 503 when the token env is unset, 401 when the bearer is wrong; true = pass. */
function authorize(
  request: FastifyRequest,
  reply: FastifyReply,
  envName: string,
): boolean {
  const expected = process.env[envName];
  if (!expected) {
    void reply.code(503).send({ error: `${envName} is not configured` });
    return false;
  }
  if (!bearerMatches(request.headers.authorization, expected)) {
    void reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}

export interface DeviceCodeRouteDeps {
  supabase: SupabaseClient<Database>;
  /** Clock override for tests. */
  now?: () => number;
}

export function registerDeviceCodeRoutes(
  server: FastifyInstance,
  deps: DeviceCodeRouteDeps,
): void {
  const now = deps.now ?? Date.now;

  server.post<{ Body: { device_uuid?: string } }>(
    "/internal/device-auth/candidates",
    async (request, reply) => {
      if (!authorize(request, reply, "DEVICE_AUTH_TOKEN")) return reply;
      const deviceUuid = request.body?.device_uuid;
      if (!deviceUuid || typeof deviceUuid !== "string") {
        return reply.code(400).send({ error: "device_uuid is required" });
      }
      try {
        return reply.send(await getCodeCandidates(deps.supabase, deviceUuid, now()));
      } catch (err) {
        if (err instanceof DeviceNotFoundError) {
          return reply.code(404).send({ error: "device not found" });
        }
        request.log.error({ err, deviceUuid }, "device code candidates failed");
        return reply.code(502).send({ error: "failed to compute device codes" });
      }
    },
  );

  server.post<{ Body: { device_uuid?: string; device_id?: string } }>(
    "/internal/devices/enroll-code",
    async (request, reply) => {
      if (!authorize(request, reply, "OPS_CERT_MINT_TOKEN")) return reply;
      const { device_uuid, device_id } = request.body ?? {};
      if (
        (typeof device_uuid !== "string" || !device_uuid) &&
        (typeof device_id !== "string" || !device_id)
      ) {
        return reply
          .code(400)
          .send({ error: "device_uuid or device_id is required" });
      }
      try {
        const uuid = await resolveDeviceUuid(
          deps.supabase,
          typeof device_uuid === "string" && device_uuid
            ? { device_uuid }
            : { device_id },
        );
        return reply.send(await getEnrollCode(deps.supabase, uuid, now()));
      } catch (err) {
        if (err instanceof DeviceNotFoundError) {
          return reply.code(404).send({ error: "device not found" });
        }
        if (err instanceof NoEnrollCodeError) {
          return reply.code(409).send({ error: err.message });
        }
        request.log.error(
          { err, device_uuid, device_id },
          "enroll-code minting failed",
        );
        return reply.code(502).send({ error: "failed to compute the enrollment code" });
      }
    },
  );
}
