import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { NavigationBar } from "@/components/navigation-bar";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "../../../backend/src/routers/router";
import type { QueryClient } from "@tanstack/react-query";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "@/components/ui/sonner";

export interface RootRouteContext {
  trpc: TRPCOptionsProxy<AppRouter>;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RootRouteContext>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="iotgw-ui-theme">
      <div className="flex min-h-screen flex-col">
        <NavigationBar />
        <main className="flex-1">
          <Outlet />
          {process.env.NODE_ENV === "development" && (
            <>
              <TanStackRouterDevtools />
              <ReactQueryDevtools initialIsOpen={false} />
            </>
          )}
          <Toaster />
        </main>
      </div>
    </ThemeProvider>
  );
}
