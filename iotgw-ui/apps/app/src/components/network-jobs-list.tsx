import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import {
  hasActiveJobs,
  JOBS_LIMIT,
  REFETCH_INTERVAL,
} from "@/lib/workflow-jobs";
import { WorkflowJobsList } from "./workflow-jobs-list";

export interface NetworkJobsListProps {
  networkId?: string;
  className?: string;
  onViewLogs?: (executionId: string) => void;
  showHeader?: boolean;
  initialNetworkFilter?: string;
}

export function NetworkJobsList({
  networkId,
  initialNetworkFilter,
  ...props
}: NetworkJobsListProps) {
  const query = useQuery({
    ...trpc.listNetworkJobs.queryOptions({
      network_id: networkId,
      limit: JOBS_LIMIT,
    }),
    refetchInterval: (query) =>
      hasActiveJobs(query.state.data ?? []) ? REFETCH_INTERVAL : false,
  });
  return (
    <WorkflowJobsList
      key={`${networkId ?? ""}:${initialNetworkFilter ?? ""}`}
      kind="network"
      jobs={query.data ?? []}
      isLoading={query.isLoading}
      isFetching={query.isFetching}
      error={query.isError ? query.error : null}
      onRefresh={() => void query.refetch()}
      initialNameFilter={initialNetworkFilter}
      scopeLabelKey={networkId ? "networkJobs.filteredByNetwork" : undefined}
      {...props}
    />
  );
}
