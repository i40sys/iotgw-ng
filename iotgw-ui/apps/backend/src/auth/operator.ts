import crypto from "node:crypto";

/**
 * Operator authentication (decision-034).
 *
 * An operator is a GoTrue (Supabase Auth) user whose `app_metadata.iotgw_role`
 * is one of OPERATOR_ROLES. Only the service role can write app_metadata, so a
 * user cannot grant the role to themselves. The browser sends the GoTrue access
 * token as `Authorization: Bearer <jwt>` (HTTP) or `connectionParams.token`
 * (WebSocket); it is an HS256 JWT signed with the stack's JWT_SECRET.
 *
 * Verification is done here with node:crypto (no JWT dependency): header alg
 * must be HS256, the signature must match, `aud` must contain "authenticated"
 * and `exp` must be in the future.
 */

export const OPERATOR_ROLES = ["operator", "admin"] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

export interface Operator {
  id: string;
  email: string;
  role: OperatorRole;
}

export type OperatorAuth =
  | { ok: true; operator: Operator }
  | { ok: false; code: "UNAUTHORIZED" | "FORBIDDEN"; reason: string };

const EXPECTED_AUDIENCE = "authenticated";

function b64urlDecode(segment: string): Buffer {
  return Buffer.from(segment, "base64url");
}

function parseJsonSegment(segment: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(b64urlDecode(segment).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function unauthorized(reason: string): OperatorAuth {
  return { ok: false, code: "UNAUTHORIZED", reason };
}

/**
 * Verify a GoTrue access token and the operator role.
 * UNAUTHORIZED = no/invalid/expired token; FORBIDDEN = a valid user without an
 * operator role.
 */
export function verifyOperatorToken(
  token: string | undefined | null,
  secret: string | undefined,
  nowMs: number = Date.now(),
): OperatorAuth {
  if (!secret) return unauthorized("JWT_SECRET is not configured");
  if (!token) return unauthorized("missing access token");

  const parts = token.split(".");
  if (parts.length !== 3) return unauthorized("malformed token");
  const [headerSeg, payloadSeg, signatureSeg] = parts;

  const header = parseJsonSegment(headerSeg);
  if (!header || header.alg !== "HS256") {
    return unauthorized("unsupported token algorithm");
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${headerSeg}.${payloadSeg}`)
    .digest();
  const presented = b64urlDecode(signatureSeg);
  if (
    presented.length !== expected.length ||
    !crypto.timingSafeEqual(presented, expected)
  ) {
    return unauthorized("invalid token signature");
  }

  const claims = parseJsonSegment(payloadSeg);
  if (!claims) return unauthorized("malformed token payload");

  const aud = claims.aud;
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(EXPECTED_AUDIENCE)) {
    return unauthorized("invalid token audience");
  }

  if (typeof claims.exp !== "number" || claims.exp * 1000 <= nowMs) {
    return unauthorized("token expired");
  }

  const id = typeof claims.sub === "string" ? claims.sub : "";
  if (!id) return unauthorized("token has no subject");
  const email = typeof claims.email === "string" ? claims.email : "";

  const appMetadata =
    claims.app_metadata && typeof claims.app_metadata === "object"
      ? (claims.app_metadata as Record<string, unknown>)
      : {};
  const role = appMetadata.iotgw_role;
  if (
    typeof role !== "string" ||
    !(OPERATOR_ROLES as readonly string[]).includes(role)
  ) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "user is not an iotgw operator",
    };
  }

  return { ok: true, operator: { id, email, role: role as OperatorRole } };
}

/** The bearer token of an HTTP request, or undefined. */
export function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1];
}

/**
 * Resolve the operator of a tRPC request: HTTP uses the Authorization header,
 * WebSocket connections use `connectionParams.token` (browsers cannot set
 * headers on a WebSocket).
 */
export function resolveOperatorAuth(
  source: {
    authorization?: string;
    connectionParams?: Record<string, string | undefined> | null;
  },
  secret: string | undefined = process.env.JWT_SECRET,
  nowMs: number = Date.now(),
): OperatorAuth {
  const token =
    bearerToken(source.authorization) ?? source.connectionParams?.token;
  return verifyOperatorToken(token, secret, nowMs);
}
