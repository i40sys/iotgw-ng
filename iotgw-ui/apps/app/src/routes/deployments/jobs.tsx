import { createFileRoute } from "@tanstack/react-router";
import { DeploymentJobsList } from "@/components/deployment-jobs-list";
import { useTranslation } from "react-i18next";
import { z } from "zod";

const deploymentJobsSearchSchema = z.object({
  deviceId: z.string().optional(),
});

export const Route = createFileRoute("/deployments/jobs")({
  component: DeploymentJobsPage,
  validateSearch: deploymentJobsSearchSchema,
});

function DeploymentJobsPage() {
  const { deviceId } = Route.useSearch();
  const { t } = useTranslation();

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-5 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("deploymentJobs.title")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("deploymentJobs.pageDescription")}
        </p>
        {deviceId && (
          <p className="text-muted-foreground text-sm">
            {t("deploymentJobs.filteredByDevice")}
          </p>
        )}
      </div>
      <DeploymentJobsList showHeader={false} deviceId={deviceId} />
    </div>
  );
}
