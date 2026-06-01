import { t } from "./trpc";
import { devicesRouter } from "./devices";
import { domainsRouter } from "./domains";
import { networksRouter } from "./networks";
import { deploymentsRouter } from "./deployments";
import { miscRouter } from "./misc";

export const appRouter = t.router({
  ...miscRouter,
  ...devicesRouter,
  ...domainsRouter,
  ...networksRouter,
  ...deploymentsRouter,
});

export type AppRouter = typeof appRouter;
