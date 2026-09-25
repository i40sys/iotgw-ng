import {
  createRootRouteWithContext,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { NavigationBar } from "@/components/navigation-bar";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "../../../backend/src/routers/router";
import type { QueryClient } from "@tanstack/react-query";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "@/components/ui/sonner";
import { getSession } from "@/lib/auth";

export interface RootRouteContext {
  trpc: TRPCOptionsProxy<AppRouter>;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RootRouteContext>()({
  // decision-034: the whole UI is operator-only. Without a session every route
  // but /login redirects to the login page (the backend enforces the role).
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/login") return;
    const session = await getSession();
    if (!session) {
      // TanStack Router's redirect is thrown by design (not an Error).
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: RootComponent,
});

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLoginPage = pathname === "/login";

  return (
    <ThemeProvider defaultTheme="dark" storageKey="iotgw-ui-theme">
      <div className="flex min-h-screen flex-col">
        {!isLoginPage && <NavigationBar />}
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
