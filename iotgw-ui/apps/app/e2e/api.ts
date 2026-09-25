/**
 * tRPC-over-HTTP helper for browser e2e: after driving the UI we verify the
 * *outcome* (device persisted, SSH key minted) and clean up via the backend
 * API. Playwright tests run in Node, so node:http works here.
 *
 * Mirrors apps/backend/e2e/trpc-client.ts — the backend mounts tRPC at the
 * root with no transformer (batch wire format `{"0": <input>}`). An explicit
 * Host header targets the nginx Ingress by vhost (fetch/undici drops it).
 *
 * Auth (decision-034): signs in once as the e2e operator against GoTrue via
 * the Kong ingress vhost (E2E_SUPABASE_HOST) and sends the access token as a
 * Bearer. Credentials: E2E_OPERATOR_EMAIL / E2E_OPERATOR_PASSWORD /
 * E2E_SUPABASE_ANON_KEY (exported from SOPS by `just e2e`).
 */
import http from "node:http";
import https from "node:https";

const ADDR = process.env.E2E_INGRESS_ADDR ?? "127.0.0.1";
const PORT = Number(process.env.E2E_INGRESS_PORT ?? "80");
const HOST = process.env.E2E_BACKEND_HOST ?? "iotgw-ui-backend.wsl.ymbihq.local";
const TLS = process.env.E2E_INGRESS_TLS === "1";
const SUPABASE_HOST = process.env.E2E_SUPABASE_HOST ?? "api.wsl.ymbihq.local";

export function operatorCredentials(): { email: string; password: string } {
  const email = process.env.E2E_OPERATOR_EMAIL;
  const password = process.env.E2E_OPERATOR_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "E2E_OPERATOR_EMAIL / E2E_OPERATOR_PASSWORD are not set — run via `just e2e`",
    );
  }
  return { email, password };
}

function signIn(): Promise<string> {
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
  if (!anonKey) {
    return Promise.reject(
      new Error("E2E_SUPABASE_ANON_KEY is not set — run via `just e2e`"),
    );
  }
  const body = JSON.stringify(operatorCredentials());
  return new Promise((resolve, reject) => {
    const lib = TLS ? https : http;
    const req = lib.request(
      {
        host: ADDR,
        port: PORT,
        path: "/auth/v1/token?grant_type=password",
        method: "POST",
        rejectUnauthorized: false,
        headers: {
          Host: SUPABASE_HOST,
          apikey: anonKey,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`operator sign-in failed: HTTP ${res.statusCode}`));
            return;
          }
          resolve((JSON.parse(raw) as { access_token: string }).access_token);
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

let tokenPromise: Promise<string> | undefined;

async function call(
  method: "GET" | "POST",
  path: string,
  body?: string,
): Promise<unknown> {
  tokenPromise ??= signIn();
  const token = await tokenPromise;
  return new Promise((resolve, reject) => {
    const lib = TLS ? https : http;
    const req = lib.request(
      {
        host: ADDR,
        port: PORT,
        path,
        method,
        rejectUnauthorized: false,
        headers: {
          Host: HOST,
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          ...(body ? { "content-length": Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            reject(
              new Error(
                `${method} ${path} -> HTTP ${res.statusCode}: ${raw.slice(0, 200)}`,
              ),
            );
            return;
          }
          const entry = Array.isArray(parsed)
            ? (parsed[0] as { result?: { data: unknown }; error?: { message: string } })
            : (parsed as { result?: { data: unknown }; error?: { message: string } });
          if (entry?.error) {
            reject(new Error(`tRPC ${path} -> ${entry.error.message}`));
            return;
          }
          resolve(entry?.result?.data);
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

export function trpcQuery<T = unknown>(
  proc: string,
  input: unknown = {},
): Promise<T> {
  const q = encodeURIComponent(JSON.stringify({ 0: input }));
  return call("GET", `/${proc}?batch=1&input=${q}`) as Promise<T>;
}

export function trpcMutate<T = unknown>(
  proc: string,
  input: unknown = {},
): Promise<T> {
  return call("POST", `/${proc}?batch=1`, JSON.stringify({ 0: input })) as Promise<T>;
}
