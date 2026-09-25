/**
 * Minimal tRPC-over-HTTP client for end-to-end tests that exercise the
 * **deployed** backend on the live kind cluster.
 *
 * Why not import the router / use `createCaller`? SSH-key minting only works
 * in-cluster: the Cosmian KMS NodePort is blocked from the host by the
 * task-057 NetworkPolicy. So an in-process test would fail KMS — the e2e must
 * drive the real backend pod over HTTP (which reaches KMS via its ClusterIP).
 *
 * The backend mounts tRPC at the root with **no transformer**, so the batch
 * wire format is raw JSON: `{"0": <input>}` and responses are
 * `[{"result":{"data": <value>}}]`.
 *
 * Transport: `node:http` with an explicit `Host` header. `fetch()`/undici
 * silently drops a custom `Host`, so it can't target the nginx Ingress by
 * vhost from the host shell; `node:http` honours it. Default target is the
 * Ingress on 127.0.0.1:80 with the backend's Ingress hostname — the exact path
 * a browser uses (verified working against the running cluster).
 *
 * Auth (decision-034): every procedure needs an operator. The client signs in
 * once against GoTrue through the Kong ingress vhost (E2E_SUPABASE_HOST,
 * default api.wsl.ymbihq.local) with E2E_OPERATOR_EMAIL / E2E_OPERATOR_PASSWORD
 * and the anon key E2E_SUPABASE_ANON_KEY (`just e2e` exports all three from
 * SOPS), then sends the access token as a Bearer on every call.
 */
import http from "node:http";
import https from "node:https";

const ADDR = process.env.E2E_INGRESS_ADDR ?? "127.0.0.1";
const PORT = Number(process.env.E2E_INGRESS_PORT ?? "80");
const HOST = process.env.E2E_BACKEND_HOST ?? "iotgw-ui-backend.wsl.ymbihq.local";
const TLS = process.env.E2E_INGRESS_TLS === "1";
const SUPABASE_HOST = process.env.E2E_SUPABASE_HOST ?? "api.wsl.ymbihq.local";

export const e2eTarget = { ADDR, PORT, HOST, TLS, SUPABASE_HOST } as const;

export interface RawResponse {
  status: number;
  body: string;
}

/** One HTTP request to the ingress, by vhost. Never throws on a status code. */
export function rawRequest(opts: {
  host: string;
  method: "GET" | "POST";
  path: string;
  body?: string;
  headers?: Record<string, string>;
}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const lib = TLS ? https : http;
    const req = lib.request(
      {
        host: ADDR,
        port: PORT,
        path: opts.path,
        method: opts.method,
        rejectUnauthorized: false,
        headers: {
          Host: opts.host,
          "content-type": "application/json",
          ...(opts.body
            ? { "content-length": Buffer.byteLength(opts.body) }
            : {}),
          ...opts.headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: raw }));
      },
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

/** Sign in to GoTrue (password grant) and return the access token. */
export async function signInOperator(
  email = process.env.E2E_OPERATOR_EMAIL,
  password = process.env.E2E_OPERATOR_PASSWORD,
): Promise<string> {
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
  if (!email || !password || !anonKey) {
    throw new Error(
      "E2E_OPERATOR_EMAIL / E2E_OPERATOR_PASSWORD / E2E_SUPABASE_ANON_KEY are not set — run via `just e2e`",
    );
  }
  const res = await rawRequest({
    host: SUPABASE_HOST,
    method: "POST",
    path: "/auth/v1/token?grant_type=password",
    body: JSON.stringify({ email, password }),
    headers: { apikey: anonKey },
  });
  if (res.status !== 200) {
    throw new Error(`operator sign-in failed: HTTP ${res.status}`);
  }
  return (JSON.parse(res.body) as { access_token: string }).access_token;
}

let tokenPromise: Promise<string> | undefined;
function operatorToken(): Promise<string> {
  tokenPromise ??= signInOperator();
  return tokenPromise;
}

type BatchEntry = {
  result?: { data: unknown };
  error?: { message: string };
};

async function call(
  method: "GET" | "POST",
  path: string,
  body?: string,
): Promise<unknown> {
  const token = await operatorToken();
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
          let parsed: BatchEntry[] | BatchEntry;
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
          const entry = Array.isArray(parsed) ? parsed[0] : parsed;
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
