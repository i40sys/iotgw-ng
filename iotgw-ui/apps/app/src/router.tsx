import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { queryClient, trpc } from "./utils/trpc";
import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorDisplay } from "@/components/ui/error-display";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    context: {
      trpc,
      queryClient,
    },
    defaultErrorComponent: ({ error }) => (
      <ErrorDisplay
        error={error instanceof Error ? error : new Error("Unknown error")}
      />
    ),
    defaultPendingComponent: () => <LoadingSpinner />,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

// Register the router for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
