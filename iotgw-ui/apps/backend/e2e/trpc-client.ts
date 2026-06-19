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
 */
import http from "node:http";
import https from "node:https";

const ADDR = process.env.E2E_INGRESS_ADDR ?? "127.0.0.1";
const PORT = Number(process.env.E2E_INGRESS_PORT ?? "80");
const HOST = process.env.E2E_BACKEND_HOST ?? "iotgw-ui-backend.wsl.ymbihq.local";
const TLS = process.env.E2E_INGRESS_TLS === "1";

export const e2eTarget = { ADDR, PORT, HOST, TLS } as const;

type BatchEntry = {
  result?: { data: unknown };
  error?: { message: string };
};

function call(
  method: "GET" | "POST",
  path: string,
  body?: string,
): Promise<unknown> {
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
