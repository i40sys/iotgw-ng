import { createFileRoute } from "@tanstack/react-router";
import { NetworkJobsList } from "@/components/network-jobs-list";
import { useTranslation } from "react-i18next";
import { z } from "zod";

const networkJobsSearchSchema = z.object({
  networkName: z.string().optional(),
});

export const Route = createFileRoute("/debug/network-jobs")({
  component: NetworkJobsPage,
  validateSearch: networkJobsSearchSchema,
});

function NetworkJobsPage() {
  const { networkName } = Route.useSearch();
  const { t } = useTranslation();

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-5 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("networkJobs.title")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("networkJobs.pageDescription")}
        </p>
      </div>
      <NetworkJobsList showHeader={false} initialNetworkFilter={networkName} />
    </div>
  );
}
