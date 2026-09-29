import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import {
  hasActiveJobs,
  JOBS_LIMIT,
  REFETCH_INTERVAL,
} from "@/lib/workflow-jobs";
import { WorkflowJobsList } from "./workflow-jobs-list";

export interface DeviceJobsListProps {
  deviceId?: string;
  networkId?: string;
  className?: string;
  onViewLogs?: (executionId: string) => void;
  showHeader?: boolean;
  initialDeviceFilter?: string;
}

export function DeviceJobsList({
  deviceId,
  networkId,
  initialDeviceFilter,
  ...props
}: DeviceJobsListProps) {
  const query = useQuery({
    ...trpc.listDeviceJobs.queryOptions({
      device_id: deviceId,
      network_id: networkId,
      limit: JOBS_LIMIT,
    }),
    refetchInterval: (query) =>
      hasActiveJobs(query.state.data ?? []) ? REFETCH_INTERVAL : false,
  });
  return (
    <WorkflowJobsList
      key={`${deviceId ?? ""}:${networkId ?? ""}:${initialDeviceFilter ?? ""}`}
      kind="device"
      jobs={query.data ?? []}
      isLoading={query.isLoading}
      isFetching={query.isFetching}
      error={query.isError ? query.error : null}
      onRefresh={() => void query.refetch()}
      initialNameFilter={initialDeviceFilter}
      scopeLabelKey={
        deviceId
          ? "deviceJobs.filteredByDevice"
          : networkId
            ? "networkJobs.filteredByNetwork"
            : undefined
      }
      {...props}
    />
  );
}
