import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import fastify from "fastify";
import { TRPCError } from "@trpc/server";
import {
  resolveOperatorAuth,
  verifyOperatorToken,
  type OperatorAuth,
} from "../operator";
import { operatorProcedure, t } from "../../routers/trpc";
import { registerInternalIngressGuard } from "../../internal/ingress-guard";

const SECRET = "test-jwt-secret-with-at-least-32-characters";
const NOW = 1_800_000_000_000; // fixed clock (ms)
const USER_ID = "3f0b8f5e-8a51-4a39-9a0e-3d8f7c1f2a10";

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Mint a GoTrue-shaped HS256 access token. */
function sign(
  claims: Record<string, unknown>,
  secret = SECRET,
  header: Record<string, unknown> = { alg: "HS256", typ: "JWT" },
): string {
  const body = `${b64url(header)}.${b64url(claims)}`;
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: USER_ID,
    email: "op@example.test",
    aud: "authenticated",
    role: "authenticated",
    exp: NOW / 1000 + 3600,
    app_metadata: { provider: "email", iotgw_role: "operator" },
    ...overrides,
  };
}

describe("verifyOperatorToken", () => {
  it("accepts a valid operator token and exposes id/email/role", () => {
    expect(verifyOperatorToken(sign(claims()), SECRET, NOW)).toEqual({
      ok: true,
      operator: { id: USER_ID, email: "op@example.test", role: "operator" },
    });
  });

  it("accepts the admin role and an aud array", () => {
    const auth = verifyOperatorToken(
      sign(
        claims({
          aud: ["authenticated", "other"],
          app_metadata: { iotgw_role: "admin" },
        }),
      ),
      SECRET,
      NOW,
    );
    expect(auth).toMatchObject({ ok: true, operator: { role: "admin" } });
  });

  it("rejects an expired token as UNAUTHORIZED", () => {
    const auth = verifyOperatorToken(
      sign(claims({ exp: NOW / 1000 - 1 })),
      SECRET,
      NOW,
    );
    expect(auth).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });

  it("rejects a token without exp", () => {
    const auth = verifyOperatorToken(sign(claims({ exp: undefined })), SECRET, NOW);
    expect(auth).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });

  it("rejects a token signed with another secret as UNAUTHORIZED", () => {
    const auth = verifyOperatorToken(
      sign(claims(), "some-other-secret-of-sufficient-length!!"),
      SECRET,
      NOW,
    );
    expect(auth).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
      reason: "invalid token signature",
    });
  });

  it("rejects alg=none and non-HS256 headers", () => {
    const body = `${b64url({ alg: "none" })}.${b64url(claims())}`;
    expect(verifyOperatorToken(`${body}.`, SECRET, NOW)).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
    expect(
      verifyOperatorToken(sign(claims(), SECRET, { alg: "HS512" }), SECRET, NOW),
    ).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });

  it("rejects the wrong audience (e.g. an anon/service key)", () => {
    const auth = verifyOperatorToken(
      sign(claims({ aud: undefined, role: "service_role" })),
      SECRET,
      NOW,
    );
    expect(auth).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });

  it("rejects a valid user without an operator role as FORBIDDEN", () => {
    for (const app_metadata of [
      { provider: "email" },
      { iotgw_role: "viewer" },
      undefined,
    ]) {
      const auth = verifyOperatorToken(sign(claims({ app_metadata })), SECRET, NOW);
      expect(auth).toMatchObject({ ok: false, code: "FORBIDDEN" });
    }
  });

  it("does not trust a role in user_metadata (user-writable)", () => {
    const auth = verifyOperatorToken(
      sign(
        claims({
          app_metadata: { provider: "email" },
          user_metadata: { iotgw_role: "admin" },
        }),
      ),
      SECRET,
      NOW,
    );
    expect(auth).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("fails closed without a token or without JWT_SECRET", () => {
    expect(verifyOperatorToken(undefined, SECRET, NOW)).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
    expect(verifyOperatorToken(sign(claims()), undefined, NOW)).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
    expect(verifyOperatorToken("not-a-jwt", SECRET, NOW)).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
  });
});

describe("resolveOperatorAuth", () => {
  it("reads the HTTP Authorization bearer", () => {
    const auth = resolveOperatorAuth(
      { authorization: `Bearer ${sign(claims())}` },
      SECRET,
      NOW,
    );
    expect(auth.ok).toBe(true);
  });

  it("reads the WebSocket connectionParams.token", () => {
    const auth = resolveOperatorAuth(
      { connectionParams: { token: sign(claims()) } },
      SECRET,
      NOW,
    );
    expect(auth).toMatchObject({ ok: true, operator: { id: USER_ID } });
  });

  it("rejects a WebSocket connection without a token", () => {
    expect(
      resolveOperatorAuth({ connectionParams: {} }, SECRET, NOW),
    ).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(resolveOperatorAuth({ connectionParams: null }, SECRET, NOW)).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
  });
});

describe("operator middleware (tRPC)", () => {
  const router = t.router({
    whoami: operatorProcedure.query(({ ctx }) => ctx.operator),
  });

  const callWith = (auth: OperatorAuth) =>
    router
      .createCaller({
        req: {} as never,
        res: {} as never,
        user: { name: "test" },
        supabase: {} as never,
        auth,
      })
      .whoami();

  it("passes ctx.operator to the procedure", async () => {
    const auth = resolveOperatorAuth(
      { authorization: `Bearer ${sign(claims())}` },
      SECRET,
      NOW,
    );
    await expect(callWith(auth)).resolves.toEqual({
      id: USER_ID,
      email: "op@example.test",
      role: "operator",
    });
  });

  it("throws UNAUTHORIZED for a missing / expired token", async () => {
    for (const token of [undefined, sign(claims({ exp: NOW / 1000 - 10 }))]) {
      const auth = resolveOperatorAuth(
        { authorization: token ? `Bearer ${token}` : undefined },
        SECRET,
        NOW,
      );
      const err = await callWith(auth).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("UNAUTHORIZED");
    }
  });

  it("throws FORBIDDEN for a user without the operator role", async () => {
    const auth = resolveOperatorAuth(
      { authorization: `Bearer ${sign(claims({ app_metadata: {} }))}` },
      SECRET,
      NOW,
    );
    const err = await callWith(auth).catch((e: unknown) => e);
    expect((err as TRPCError).code).toBe("FORBIDDEN");
  });
});

describe("/internal/* ingress guard", () => {
  const build = () => {
    const server = fastify();
    registerInternalIngressGuard(server);
    server.post("/internal/device-auth/candidates", () => ({ ok: true }));
    server.get("/getDomains", () => ({ ok: true }));
    return server;
  };

  it("refuses /internal/* requests carrying X-Forwarded-For (came through the ingress)", async () => {
    const res = await build().inject({
      method: "POST",
      url: "/internal/device-auth/candidates",
      headers: { "x-forwarded-for": "10.244.0.1" },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets in-cluster /internal/* calls (no X-Forwarded-For) through", async () => {
    const res = await build().inject({
      method: "POST",
      url: "/internal/device-auth/candidates",
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it("does not affect non-internal routes", async () => {
    const res = await build().inject({
      method: "GET",
      url: "/getDomains",
      headers: { "x-forwarded-for": "10.244.0.1" },
    });
    expect(res.statusCode).toBe(200);
  });
});
