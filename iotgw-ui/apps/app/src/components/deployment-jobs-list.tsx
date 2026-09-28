import { useState, useEffect, useId } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faCircleCheck,
  faCircleXmark,
  faClock,
  faArrowUpRightFromSquare,
  faFileCode,
  faChevronLeft,
  faChevronRight,
  faRotate,
  faFilterCircleXmark,
  faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import type { Database } from "@iotgw/supabase-contract";
import { DeploymentConfigViewer } from "./deployment-config-viewer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DeploymentJob = Database["public"]["Tables"]["deployment_jobs"]["Row"];

export interface DeploymentJobsListProps {
  /** Optional device ID to filter jobs by device */
  deviceId?: string;
  /** Additional className for styling */
  className?: string;
  /** Callback when View Logs button is clicked */
  onViewLogs?: (executionId: string) => void;
  /** Callback when View Config button is clicked */
  onViewConfig?: (config: unknown) => void;
  /** Whether to show the card header (title and description). Defaults to true */
  showHeader?: boolean;
  /** Maximum number of items to display. If set, shows a "View All" button */
  maxItems?: number;
}

const JOBS_PER_PAGE = 10;
const JOBS_LIMIT = 100;
const REFETCH_INTERVAL = 5000;
const JOB_STATUSES = ["RUNNING", "SUCCESS", "FAILED", "PENDING"] as const;

const hasActiveJobs = (jobs: DeploymentJob[]) =>
  jobs.some((job) => ["RUNNING", "PENDING"].includes(job.status.toUpperCase()));

export function DeploymentJobsList({
  deviceId,
  className,
  onViewLogs,
  onViewConfig,
  showHeader = true,
  maxItems,
}: DeploymentJobsListProps) {
  const { t, i18n } = useTranslation();
  const filterId = useId();
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<DeploymentJob | null>(null);

  const jobsQuery = useQuery({
    ...trpc.listDeploymentJobs.queryOptions({
      device_id: deviceId,
      limit: JOBS_LIMIT,
    }),
    refetchInterval: (query) =>
      hasActiveJobs(query.state.data ?? []) ? REFETCH_INTERVAL : false,
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [deviceId]);

  const allJobs = jobsQuery.data ?? [];
  const shouldPoll = hasActiveJobs(allJobs);
  const searchTerms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hasFilters = search.length > 0 || filterStatus !== "all";
  const filteredJobs = allJobs.filter((job) => {
    if (filterStatus !== "all" && job.status.toUpperCase() !== filterStatus) {
      return false;
    }
    const searchableText = [
      job.device_name,
      job.device_ip_address,
      job.network_name,
      job.domain_name,
      job.domain_display_name,
      job.deployment_name,
      job.deployment_version,
      job.execution_id,
    ]
      .join(" ")
      .toLowerCase();
    return searchTerms.every((term) => searchableText.includes(term));
  });

  const totalJobs = filteredJobs.length;
  const totalPages = Math.max(1, Math.ceil(totalJobs / JOBS_PER_PAGE));
  // Polling can reduce the filtered result set while the operator is on a later page.
  const page = Math.min(currentPage, totalPages);
  const startIndex = maxItems ? 0 : (page - 1) * JOBS_PER_PAGE;
  const endIndex = Math.min(
    startIndex + (maxItems ?? JOBS_PER_PAGE),
    totalJobs,
  );
  const paginatedJobs = filteredJobs.slice(startIndex, endIndex);

  const resetFilters = () => {
    setSearch("");
    setFilterStatus("all");
    setCurrentPage(1);
  };

  const statusLabel = (status: string) =>
    t(`deploymentJobs.status.${status.toLowerCase()}`, {
      defaultValue: status,
    });

  const renderStatus = (status: string) => {
    const style = {
      RUNNING: {
        icon: faSpinner,
        color:
          "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
      },
      SUCCESS: {
        icon: faCircleCheck,
        color:
          "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300",
      },
      FAILED: {
        icon: faCircleXmark,
        color:
          "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300",
      },
      PENDING: {
        icon: faClock,
        color:
          "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
      },
    }[status.toUpperCase()];

    return (
      <Badge
        variant="outline"
        className={cn("gap-1.5 px-2 py-1", style?.color)}
      >
        <FontAwesomeIcon
          icon={style?.icon ?? faClock}
          className={cn(
            "size-3",
            status.toUpperCase() === "RUNNING" &&
              "animate-spin motion-reduce:animate-none",
          )}
          aria-hidden="true"
        />
        {statusLabel(status)}
      </Badge>
    );
  };

  const renderDate = (value: string | null) =>
    value ? (
      <time dateTime={value} className="tabular-nums">
        {new Date(value).toLocaleString(
          i18n.resolvedLanguage ?? i18n.language,
          {
            dateStyle: "medium",
            timeStyle: "medium",
          },
        )}
      </time>
    ) : (
      <span className="text-muted-foreground">
        {t("deploymentJobs.notCompleted")}
      </span>
    );

  const renderDevice = (job: DeploymentJob) => (
    <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
      <p className="font-medium">{job.device_name}</p>
      <p className="text-muted-foreground font-mono text-xs">
        {job.device_ip_address}
      </p>
    </div>
  );

  const renderDeployment = (job: DeploymentJob) => (
    <div className="space-y-1 [overflow-wrap:anywhere]">
      <p className="font-medium">{job.deployment_name}</p>
      <p className="text-muted-foreground text-xs">v{job.deployment_version}</p>
    </div>
  );

  const renderExecution = (job: DeploymentJob) => (
    <div className="min-w-0 space-y-1">
      <span className="text-muted-foreground text-xs">
        {t("deploymentJobs.executionId")}
      </span>
      <p className="font-mono text-xs [overflow-wrap:anywhere]">
        {job.execution_id}
      </p>
    </div>
  );

  const renderActions = (job: DeploymentJob) => (
    <div className="grid grid-cols-2 gap-2 @5xl:grid-cols-1">
      {onViewLogs ? (
        <Button
          variant="outline"
          size="sm"
          className="h-auto min-h-11 min-w-0 px-2 py-2 text-center whitespace-normal @5xl:min-h-9"
          aria-label={t("deploymentJobs.viewLogs")}
          onClick={() => onViewLogs(job.execution_id)}
        >
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
          {t("deploymentJobs.logsAction")}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-auto min-h-11 min-w-0 px-2 py-2 text-center whitespace-normal @5xl:min-h-9"
          asChild
        >
          <Link
            to="/deployments/debug/$executionId"
            params={{ executionId: job.execution_id }}
            aria-label={t("deploymentJobs.viewLogs")}
          >
            <FontAwesomeIcon
              icon={faArrowUpRightFromSquare}
              aria-hidden="true"
            />
            {t("deploymentJobs.logsAction")}
          </Link>
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-auto min-h-11 min-w-0 px-2 py-2 text-center whitespace-normal @5xl:min-h-9"
        aria-label={t("deploymentJobs.viewConfig")}
        onClick={() => {
          if (onViewConfig) {
            onViewConfig(job.configuration_json);
          } else {
            setSelectedJob(job);
            setConfigModalOpen(true);
          }
        }}
      >
        <FontAwesomeIcon icon={faFileCode} aria-hidden="true" />
        {t("deploymentJobs.configAction")}
      </Button>
    </div>
  );

  return (
    <Card className={cn("@container min-w-0", className)}>
      {showHeader && (
        <CardHeader className="p-4 pb-0 sm:p-6 sm:pb-0">
          <CardTitle>{t("deploymentJobs.title")}</CardTitle>
          <CardDescription>
            {t("deploymentJobs.description")}
            {deviceId && ` · ${t("deploymentJobs.filteredByDevice")}`}
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className="space-y-4 p-4 sm:p-6">
        {!maxItems && (
          <div className="grid gap-3 @xl:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="min-w-0 space-y-2">
              <Label htmlFor={`${filterId}-search`}>
                {t("deploymentJobs.search.label")}
              </Label>
              <div className="relative">
                <FontAwesomeIcon
                  icon={faMagnifyingGlass}
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  id={`${filterId}-search`}
                  type="search"
                  className="h-10 pl-9"
                  placeholder={t("deploymentJobs.search.placeholder")}
                  aria-describedby={`${filterId}-search-help`}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${filterId}-status`}>
                {t("deploymentJobs.statusColumn")}
              </Label>
              <Select
                value={filterStatus}
                onValueChange={(value) => {
                  setFilterStatus(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger
                  id={`${filterId}-status`}
                  className="h-10 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("deploymentJobs.allStatuses")}
                  </SelectItem>
                  {JOB_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {statusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p
              id={`${filterId}-search-help`}
              className="text-muted-foreground text-xs @xl:col-span-2"
            >
              {t("deploymentJobs.search.help")}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <p role="status" className="text-muted-foreground text-sm">
              {jobsQuery.isLoading
                ? t("common.loading")
                : t("deploymentJobs.resultRange", {
                    from: totalJobs ? startIndex + 1 : 0,
                    to: endIndex,
                    count: totalJobs,
                  })}
            </p>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5"
                onClick={resetFilters}
              >
                <FontAwesomeIcon
                  icon={faFilterCircleXmark}
                  aria-hidden="true"
                />
                {t("deploymentJobs.clearFilters")}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {shouldPoll && (
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                <span
                  className="size-1.5 rounded-full bg-blue-500"
                  aria-hidden="true"
                />
                {t("deploymentJobs.monitoring")}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={jobsQuery.isFetching}
              onClick={() => void jobsQuery.refetch()}
            >
              <FontAwesomeIcon
                icon={faRotate}
                className={cn(
                  jobsQuery.isFetching &&
                    "animate-spin motion-reduce:animate-none",
                )}
                aria-hidden="true"
              />
              {t("deploymentJobs.refresh")}
            </Button>
          </div>
        </div>
        {allJobs.length === JOBS_LIMIT && !maxItems && (
          <p className="text-muted-foreground text-xs">
            {t("deploymentJobs.recentLimit", { count: JOBS_LIMIT })}
          </p>
        )}

        {jobsQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : jobsQuery.isError ? (
          <ErrorDisplay error={jobsQuery.error} />
        ) : totalJobs === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-12 text-center">
            <FontAwesomeIcon
              icon={hasFilters ? faMagnifyingGlass : faClock}
              className="text-muted-foreground mb-2 size-8"
              aria-hidden="true"
            />
            <p className="font-medium">
              {t(
                allJobs.length
                  ? "deploymentJobs.noMatches"
                  : "deploymentJobs.noJobs",
              )}
            </p>
            <p className="text-muted-foreground max-w-md text-sm">
              {t(
                allJobs.length
                  ? "deploymentJobs.adjustFilters"
                  : deviceId
                    ? "deploymentJobs.noJobsForDevice"
                    : "deploymentJobs.noJobsDescription",
              )}
            </p>
          </div>
        ) : (
          <>
            {/* Container queries also keep the embedded deployment preview usable. */}
            <div className="hidden rounded-lg border @5xl:block">
              <Table className="table-fixed">
                <TableCaption className="sr-only">
                  {t("deploymentJobs.title")}
                </TableCaption>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col" className="w-[18%] px-3">
                      {t("deploymentJobs.statusColumn")}
                    </TableHead>
                    <TableHead scope="col" className="w-[18%] px-3">
                      {t("deploymentJobs.device")}
                    </TableHead>
                    <TableHead scope="col" className="w-[16%] px-3">
                      {t("deploymentJobs.deployment")}
                    </TableHead>
                    <TableHead scope="col" className="w-[17%] px-3">
                      {t("deploymentJobs.networkDomain")}
                    </TableHead>
                    <TableHead scope="col" className="w-[18%] px-3">
                      {t("deploymentJobs.timing")}
                    </TableHead>
                    <TableHead scope="col" className="w-[13%] px-3 text-center">
                      {t("common.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedJobs.map((job) => (
                    <TableRow
                      key={job.id}
                      className="[&>td]:px-3 [&>td]:py-4 [&>td]:align-top"
                    >
                      <TableCell>
                        <div className="space-y-3">
                          {renderStatus(job.status)}
                          {renderExecution(job)}
                        </div>
                      </TableCell>
                      <TableCell>{renderDevice(job)}</TableCell>
                      <TableCell>{renderDeployment(job)}</TableCell>
                      <TableCell>
                        <div className="space-y-1 [overflow-wrap:anywhere]">
                          <p>{job.network_name}</p>
                          <p className="text-muted-foreground text-xs">
                            {job.domain_display_name || job.domain_name}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <dl className="space-y-2 text-xs">
                          <div>
                            <dt className="text-muted-foreground">
                              {t("deploymentJobs.startedAt")}
                            </dt>
                            <dd className="mt-0.5">
                              {renderDate(job.started_at)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              {t("deploymentJobs.completedAt")}
                            </dt>
                            <dd className="mt-0.5">
                              {renderDate(job.completed_at)}
                            </dd>
                          </div>
                        </dl>
                      </TableCell>
                      <TableCell>{renderActions(job)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul
              className="grid gap-4 @2xl:grid-cols-2 @5xl:hidden"
              aria-label={t("deploymentJobs.title")}
            >
              {paginatedJobs.map((job) => (
                <li
                  key={job.id}
                  className="flex min-w-0 flex-col gap-4 rounded-lg border p-4 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 basis-36">
                      {renderDevice(job)}
                    </div>
                    {renderStatus(job.status)}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 [overflow-wrap:anywhere]">
                    <div className="col-span-2 min-w-0 space-y-1">
                      <dt className="text-muted-foreground text-xs">
                        {t("deploymentJobs.deployment")}
                      </dt>
                      <dd>{renderDeployment(job)}</dd>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <dt className="text-muted-foreground text-xs">
                        {t("deploymentJobs.network")}
                      </dt>
                      <dd>{job.network_name}</dd>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <dt className="text-muted-foreground text-xs">
                        {t("deploymentJobs.domain")}
                      </dt>
                      <dd>{job.domain_display_name || job.domain_name}</dd>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <dt className="text-muted-foreground text-xs">
                        {t("deploymentJobs.startedAt")}
                      </dt>
                      <dd className="text-xs">{renderDate(job.started_at)}</dd>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <dt className="text-muted-foreground text-xs">
                        {t("deploymentJobs.completedAt")}
                      </dt>
                      <dd className="text-xs">
                        {renderDate(job.completed_at)}
                      </dd>
                    </div>
                  </dl>
                  {renderExecution(job)}
                  <div className="mt-auto border-t pt-3">
                    {renderActions(job)}
                  </div>
                </li>
              ))}
            </ul>

            {!maxItems && totalPages > 1 && (
              <nav
                className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
                aria-label={t("deploymentJobs.pagination.label")}
              >
                <p className="text-muted-foreground text-sm">
                  {t("deploymentJobs.pagination.page")} {page}{" "}
                  {t("deploymentJobs.pagination.of")} {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10"
                    onClick={() => setCurrentPage(page - 1)}
                    disabled={page === 1}
                  >
                    <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
                    {t("deploymentJobs.pagination.previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10"
                    onClick={() => setCurrentPage(page + 1)}
                    disabled={page === totalPages}
                  >
                    {t("deploymentJobs.pagination.next")}
                    <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
                  </Button>
                </div>
              </nav>
            )}
            {maxItems && totalJobs > maxItems && (
              <div className="flex justify-center border-t pt-4">
                <Button
                  variant="outline"
                  className="h-auto min-h-10 text-center whitespace-normal"
                  asChild
                >
                  <Link to="/deployments/jobs" search={{ deviceId }}>
                    {t("deploymentJobs.viewAll", { count: totalJobs })}
                    <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
      <DeploymentConfigViewer
        open={configModalOpen}
        onOpenChange={setConfigModalOpen}
        configuration={selectedJob?.configuration_json ?? {}}
        deploymentName={selectedJob?.deployment_name}
        deploymentVersion={selectedJob?.deployment_version}
      />
    </Card>
  );
}
