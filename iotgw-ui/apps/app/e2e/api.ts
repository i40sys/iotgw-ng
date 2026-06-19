/**
 * tRPC-over-HTTP helper for browser e2e: after driving the UI we verify the
 * *outcome* (device persisted, SSH key minted) and clean up via the backend
 * API. Playwright tests run in Node, so node:http works here.
 *
 * Mirrors apps/backend/e2e/trpc-client.ts — the backend mounts tRPC at the
 * root with no transformer (batch wire format `{"0": <input>}`). An explicit
 * Host header targets the nginx Ingress by vhost (fetch/undici drops it).
 */
import http from "node:http";
import https from "node:https";

const ADDR = process.env.E2E_INGRESS_ADDR ?? "127.0.0.1";
const PORT = Number(process.env.E2E_INGRESS_PORT ?? "80");
const HOST = process.env.E2E_BACKEND_HOST ?? "iotgw-ui-backend.wsl.ymbihq.local";
const TLS = process.env.E2E_INGRESS_TLS === "1";

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
