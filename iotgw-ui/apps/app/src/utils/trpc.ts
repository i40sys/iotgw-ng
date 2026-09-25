import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import {
  TRPCClientError,
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  loggerLink,
  splitLink,
  wsLink,
} from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "../../../backend/src/routers/router";
import { getAccessToken, loginPath, signOut } from "@/lib/auth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4444/";

// decision-034: every procedure requires an operator. A call answered with
// UNAUTHORIZED (no/expired session) or FORBIDDEN (not an operator) drops the
// local session and sends the user to the login page.
let isRedirecting = false;
function handleAuthError(error: unknown): void {
  if (!(error instanceof TRPCClientError)) return;
  const code = (error.data as { code?: string } | undefined)?.code;
  if (code !== "UNAUTHORIZED" && code !== "FORBIDDEN") return;
  if (isRedirecting || window.location.pathname === "/login") return;
  isRedirecting = true;
  const here = window.location.pathname + window.location.search;
  void signOut().finally(() => {
    const target = loginPath(here);
    window.location.assign(
      code === "FORBIDDEN"
        ? `${target}${target.includes("?") ? "&" : "?"}reason=forbidden`
        : target,
    );
  });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleAuthError }),
  mutationCache: new MutationCache({ onError: handleAuthError }),
});

// Subscriptions go over WebSocket; browsers cannot set headers on it, so the
// token travels in connectionParams. Lazy: no socket until a subscription.
const wsClient = createWSClient({
  url: API_URL.replace(/^http/, "ws"),
  lazy: { enabled: true, closeMs: 0 },
  connectionParams: async () => {
    const token = await getAccessToken();
    return token ? { token } : {};
  },
});

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    loggerLink({
      enabled: (opts) =>
        process.env.NODE_ENV === "development" ||
        (opts.direction === "down" && opts.result instanceof Error),
    }),
    splitLink({
      condition: (op) => op.type === "subscription",
      true: wsLink({ client: wsClient }),
      false: httpBatchLink({
        url: API_URL,
        headers: async () => {
          const token = await getAccessToken();
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
