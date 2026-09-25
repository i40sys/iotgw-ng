/**
 * End-to-end: operator authentication on the live kind stack (decision-034).
 *
 *   - tRPC without a token / with a forged token      -> 401 UNAUTHORIZED
 *   - tRPC as the e2e operator (SOPS credentials)     -> 200
 *   - /internal/* through the public ingress          -> 403 (in-cluster only)
 *   - GoTrue self sign-up                             -> refused
 *
 * Run via `just e2e` (exports E2E_OPERATOR_EMAIL / E2E_OPERATOR_PASSWORD /
 * E2E_SUPABASE_ANON_KEY from SOPS). Soft-skips if the backend is unreachable.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { e2eTarget, rawRequest, signInOperator } from "./trpc-client";

const GET_DOMAINS = "/getDomains?batch=1&input=%7B%220%22%3A%7B%7D%7D";

describe("operator authentication (live kind stack)", () => {
  let up = false;

  beforeAll(async () => {
    try {
      const res = await rawRequest({
        host: e2eTarget.HOST,
        method: "GET",
        path: GET_DOMAINS,
      });
      up = res.status > 0 && res.status < 500;
    } catch {
      up = false;
    }
    if (!up) console.warn("[e2e] backend not reachable — skipping auth checks");
  });

  it("refuses tRPC calls without a token (401)", async () => {
    if (!up) return;
    const res = await rawRequest({
      host: e2eTarget.HOST,
      method: "GET",
      path: GET_DOMAINS,
    });
    expect(res.status).toBe(401);
    expect(res.body).toContain("UNAUTHORIZED");
  });

  it("refuses a forged token (401)", async () => {
    if (!up) return;
    const forged =
      "eyJhbGciOiJIUzI1NiJ9." +
      Buffer.from(
        JSON.stringify({
          sub: "x",
          aud: "authenticated",
          exp: 4102444800,
          app_metadata: { iotgw_role: "admin" },
        }),
      ).toString("base64url") +
      ".AAAA";
    const res = await rawRequest({
      host: e2eTarget.HOST,
      method: "GET",
      path: GET_DOMAINS,
      headers: { authorization: `Bearer ${forged}` },
    });
    expect(res.status).toBe(401);
  });

  it("serves the e2e operator", async () => {
    if (!up) return;
    const token = await signInOperator();
    const res = await rawRequest({
      host: e2eTarget.HOST,
      method: "GET",
      path: GET_DOMAINS,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it("refuses /internal/* through the ingress (403)", async () => {
    if (!up) return;
    const res = await rawRequest({
      host: e2eTarget.HOST,
      method: "POST",
      path: "/internal/device-auth/candidates",
      body: "{}",
    });
    expect(res.status).toBe(403);
  });

  it("GoTrue refuses self sign-up", async () => {
    if (!up) return;
    const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
    expect(anonKey, "E2E_SUPABASE_ANON_KEY is not set").toBeTruthy();
    const res = await rawRequest({
      host: e2eTarget.SUPABASE_HOST,
      method: "POST",
      path: "/auth/v1/signup",
      body: JSON.stringify({
        email: `e2e-signup-${Date.now()}@example.invalid`,
        password: "a-long-enough-password-123",
      }),
      headers: { apikey: anonKey! },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
