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

  return (
    <div className="container mx-auto p-6">
      <DeploymentJobsList showHeader={false} deviceId={deviceId} />
    </div>
  );
}
