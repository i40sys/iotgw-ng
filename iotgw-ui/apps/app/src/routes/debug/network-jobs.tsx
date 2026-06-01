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

  return (
    <div className="container mx-auto p-6">
      <NetworkJobsList showHeader={false} initialNetworkFilter={networkName} />
    </div>
  );
}
