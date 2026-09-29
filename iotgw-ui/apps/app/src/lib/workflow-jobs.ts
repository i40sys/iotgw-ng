import type { Database } from "@iotgw/supabase-contract";

export type JobKind = "device" | "network";
export type DeviceJob = Database["public"]["Tables"]["device_jobs"]["Row"];
export type NetworkJob = Database["public"]["Tables"]["network_jobs"]["Row"] & {
  domain_id?: string | null;
  domain_name?: string | null;
  domain_display_name?: string | null;
};
export type WorkflowJob = DeviceJob | NetworkJob;

export const JOBS_LIMIT = 100;
export const REFETCH_INTERVAL = 5000;
export const PAGE_SIZES = [10, 25, 50, 100];
export const JOB_STATUSES = ["RUNNING", "SUCCESS", "FAILED", "PENDING"];

export interface JobPreferences {
  search: string;
  filterStatus: string;
  filterDomain: string;
  itemsPerPage: number;
  sortField: "started_at" | "completed_at";
  sortDirection: "asc" | "desc";
}

export const jobPreferencesKey = (kind: JobKind) => `${kind}-jobs-preferences`;

export function loadJobPreferences(
  kind: JobKind,
  initialName?: string,
): JobPreferences {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(jobPreferencesKey(kind)) ?? "null",
    );
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      stored = parsed as Record<string, unknown>;
    }
  } catch {
    // Invalid or unavailable browser storage should not prevent viewing jobs.
  }
  const legacySearch = [
    stored.filterExecutionOrTransaction,
    stored.filterDeviceName,
    stored.filterNetworkName,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .trim();
  const savedStatus =
    typeof stored.filterStatus === "string"
      ? stored.filterStatus.toUpperCase()
      : "";
  return {
    search:
      initialName ??
      (typeof stored.search === "string" ? stored.search : legacySearch),
    filterStatus: JOB_STATUSES.includes(savedStatus) ? savedStatus : "all",
    filterDomain:
      kind === "network" &&
      typeof stored.filterDomain === "string" &&
      stored.filterDomain
        ? stored.filterDomain
        : "all",
    itemsPerPage:
      typeof stored.itemsPerPage === "number" &&
      PAGE_SIZES.includes(stored.itemsPerPage)
        ? stored.itemsPerPage
        : stored.itemsPerPage === 250 || stored.itemsPerPage === 500
          ? 100
          : 10,
    sortField:
      stored.sortField === "completed_at" ? "completed_at" : "started_at",
    sortDirection: stored.sortDirection === "asc" ? "asc" : "desc",
  };
}

export const hasActiveJobs = (jobs: { status: string }[]) =>
  jobs.some((job) => ["RUNNING", "PENDING"].includes(job.status.toUpperCase()));

export function filterAndSortJobs(
  jobs: WorkflowJob[],
  preferences: JobPreferences,
): WorkflowJob[] {
  const terms = preferences.search
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return jobs
    .filter((job) => {
      if (
        preferences.filterStatus !== "all" &&
        job.status.toUpperCase() !== preferences.filterStatus
      )
        return false;
      if (
        preferences.filterDomain !== "all" &&
        (!("domain_id" in job) || job.domain_id !== preferences.filterDomain)
      )
        return false;
      const searchable = [
        job.execution_id,
        job.transaction_id,
        job.network_name,
        ...("device_name" in job
          ? [job.device_name, job.device_ip_address]
          : [
              job.network_ipv4,
              job.network_ipv6,
              job.domain_name,
              job.domain_display_name,
            ]),
      ]
        .join(" ")
        .toLowerCase();
      return terms.every((term) => searchable.includes(term));
    })
    .sort((a, b) => {
      const aValue = a[preferences.sortField];
      const bValue = b[preferences.sortField];
      const aTime = aValue ? Date.parse(aValue) : NaN;
      const bTime = bValue ? Date.parse(bValue) : NaN;
      // Unfinished jobs stay last when sorting by completion in either direction.
      if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
      if (!Number.isFinite(aTime)) return 1;
      if (!Number.isFinite(bTime)) return -1;
      return preferences.sortDirection === "asc"
        ? aTime - bTime
        : bTime - aTime;
    });
}

export function jobDuration(job: WorkflowJob): string | null {
  if (!job.completed_at) return null;
  const elapsed = Date.parse(job.completed_at) - Date.parse(job.started_at);
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours
    ? `${hours}h ${minutes % 60}m ${seconds % 60}s`
    : minutes
      ? `${minutes}m ${seconds % 60}s`
      : `${seconds}s`;
}
