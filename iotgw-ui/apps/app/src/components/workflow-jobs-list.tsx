import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faChevronLeft,
  faChevronRight,
  faCircleCheck,
  faCircleXmark,
  faClock,
  faFilterCircleXmark,
  faMagnifyingGlass,
  faRotate,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorDisplay } from "@/components/ui/error-display";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  filterAndSortJobs,
  hasActiveJobs,
  jobDuration,
  jobPreferencesKey,
  loadJobPreferences,
  JOBS_LIMIT,
  JOB_STATUSES,
  PAGE_SIZES,
  type JobKind,
  type JobPreferences,
  type WorkflowJob,
} from "@/lib/workflow-jobs";

interface WorkflowJobsListProps {
  kind: JobKind;
  jobs: WorkflowJob[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  onRefresh: () => void;
  onViewLogs?: (executionId: string) => void;
  showHeader?: boolean;
  className?: string;
  initialNameFilter?: string;
  scopeLabelKey?: string;
}

const statusStyles = {
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
};

export function WorkflowJobsList({
  kind,
  jobs,
  isLoading,
  isFetching,
  error,
  onRefresh,
  onViewLogs,
  showHeader = true,
  className,
  initialNameFilter,
  scopeLabelKey,
}: WorkflowJobsListProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const namespace = `${kind}Jobs`;
  const [preferences, setPreferences] = useState(() =>
    loadJobPreferences(kind, initialNameFilter),
  );
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    try {
      localStorage.setItem(
        jobPreferencesKey(kind),
        JSON.stringify(preferences),
      );
    } catch {
      /* Storage may be disabled; controls still work for this visit. */
    }
  }, [kind, preferences]);

  const updatePreferences = (next: Partial<JobPreferences>) => {
    setPreferences((previous) => ({ ...previous, ...next }));
    setCurrentPage(1);
  };
  const resetFilters = () =>
    updatePreferences({
      search: "",
      filterStatus: "all",
      filterDomain: "all",
      sortField: "started_at",
      sortDirection: "desc",
    });
  const hasFilters = Boolean(
    preferences.search ||
      preferences.filterStatus !== "all" ||
      preferences.filterDomain !== "all",
  );
  const processedJobs = useMemo(
    () => filterAndSortJobs(jobs, preferences),
    [jobs, preferences],
  );
  const totalJobs = processedJobs.length;
  const totalPages = Math.max(
    1,
    Math.ceil(totalJobs / preferences.itemsPerPage),
  );
  const page = Math.min(currentPage, totalPages);
  const startIndex = (page - 1) * preferences.itemsPerPage;
  const endIndex = Math.min(startIndex + preferences.itemsPerPage, totalJobs);
  const visibleJobs = processedJobs.slice(startIndex, endIndex);
  const domains = new Map<string, string>();
  for (const job of jobs) {
    if ("domain_id" in job && job.domain_id) {
      domains.set(
        job.domain_id,
        job.domain_display_name ?? job.domain_name ?? job.domain_id,
      );
    }
  }
  if (
    preferences.filterDomain !== "all" &&
    !domains.has(preferences.filterDomain)
  ) {
    domains.set(preferences.filterDomain, t("jobList.unavailableDomain"));
  }
  const statusLabel = (status: string) =>
    t(`${namespace}.status.${status.toLowerCase()}`, { defaultValue: status });
  const renderStatus = (status: string) => {
    const style =
      statusStyles[status.toUpperCase() as keyof typeof statusStyles];
    return (
      <Badge
        variant="outline"
        className={cn(
          "max-w-full gap-1.5 px-2 py-1 whitespace-normal",
          style?.color,
        )}
      >
        <FontAwesomeIcon
          icon={style?.icon ?? faClock}
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0",
            status.toUpperCase() === "RUNNING" &&
              "animate-spin motion-reduce:animate-none",
          )}
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
          { dateStyle: "medium", timeStyle: "medium" },
        )}
      </time>
    ) : (
      <span className="text-muted-foreground">{t("jobList.notCompleted")}</span>
    );
  const renderReferences = (job: WorkflowJob) => (
    <dl className="space-y-3 text-xs">
      <div>
        <dt className="text-muted-foreground">{t("jobList.executionId")}</dt>
        <dd className="mt-1 font-mono [overflow-wrap:anywhere]">
          {job.execution_id}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t("jobList.transactionId")}</dt>
        <dd className="mt-1 font-mono [overflow-wrap:anywhere]">
          {job.transaction_id ?? t("jobList.notAvailable")}
        </dd>
      </div>
    </dl>
  );
  const renderNetwork = (job: WorkflowJob) =>
    job.network_name ? (
      <Link
        to="/networks"
        search={{ networkName: job.network_name }}
        className="font-medium [overflow-wrap:anywhere] text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
      >
        {job.network_name}
      </Link>
    ) : (
      <span className="text-muted-foreground">{t("jobList.noNetwork")}</span>
    );
  const renderPrimary = (job: WorkflowJob) => (
    <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
      {"device_name" in job ? (
        <>
          <p className="font-medium">{job.device_name}</p>
          {job.device_ip_address && (
            <p className="text-muted-foreground font-mono text-xs">
              {job.device_ip_address}
            </p>
          )}
        </>
      ) : (
        <>
          {renderNetwork(job)}
          {job.network_ipv4 && (
            <p className="text-muted-foreground font-mono text-xs">
              IPv4: {job.network_ipv4}
            </p>
          )}
          {job.network_ipv6 && (
            <p className="text-muted-foreground font-mono text-xs">
              IPv6: {job.network_ipv6}
            </p>
          )}
        </>
      )}
    </div>
  );
  const renderRelated = (job: WorkflowJob) => {
    if ("device_name" in job) return renderNetwork(job);
    const domainName = job.domain_display_name ?? job.domain_name;
    return job.domain_id && domainName ? (
      <Link
        to="/domains/$id"
        params={{ id: job.domain_id }}
        className="[overflow-wrap:anywhere] text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
      >
        {domainName}
      </Link>
    ) : (
      <span className="text-muted-foreground [overflow-wrap:anywhere]">
        {domainName ?? t("jobList.notAvailable")}
      </span>
    );
  };
  const renderTiming = (job: WorkflowJob, mobile = false) => {
    const duration = jobDuration(job);
    return (
      <dl className={cn("grid gap-2 text-xs", mobile && "grid-cols-2 gap-x-4")}>
        <div>
          <dt className="text-muted-foreground">
            {t(`${namespace}.startedAt`)}
          </dt>
          <dd className="mt-0.5">{renderDate(job.started_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t(`${namespace}.completedAt`)}
          </dt>
          <dd className="mt-0.5">{renderDate(job.completed_at)}</dd>
        </div>
        {duration && (
          <div
            className={cn(
              "text-muted-foreground flex flex-wrap gap-x-1",
              mobile && "col-span-2",
            )}
          >
            <dt>{t("jobList.duration")}:</dt>
            <dd className="tabular-nums">{duration}</dd>
          </div>
        )}
      </dl>
    );
  };
  const renderLogs = (job: WorkflowJob) => {
    const content = (
      <>
        <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
        {t("jobList.logs")}
      </>
    );
    const buttonClass =
      "h-auto min-h-11 w-full min-w-0 px-2 py-2 text-center whitespace-normal @5xl:min-h-9 @5xl:text-xs";
    return onViewLogs ? (
      <Button
        variant="outline"
        size="sm"
        className={buttonClass}
        aria-label={t(`${namespace}.viewLogs`)}
        onClick={() => onViewLogs(job.execution_id)}
      >
        {content}
      </Button>
    ) : (
      <Button variant="outline" size="sm" className={buttonClass} asChild>
        <Link
          to={kind === "device" ? "/devices/debug/$id" : "/networks/debug/$id"}
          params={{ id: job.execution_id }}
          aria-label={t(`${namespace}.viewLogs`)}
        >
          {content}
        </Link>
      </Button>
    );
  };
  const triggerClass =
    "h-auto min-h-10 min-w-0 text-left whitespace-normal [&>span]:line-clamp-none [&>span]:[overflow-wrap:anywhere] [&>svg]:shrink-0";

  return (
    <Card className={cn("@container min-w-0", className)}>
      {showHeader && (
        <CardHeader className="p-4 pb-0 sm:p-6 sm:pb-0">
          <CardTitle>{t(`${namespace}.title`)}</CardTitle>
          <CardDescription>
            {t(`${namespace}.description`)}
            {scopeLabelKey && ` · ${t(scopeLabelKey)}`}
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div
          className={cn(
            "grid grid-cols-2 items-start gap-3",
            kind === "network"
              ? "@5xl:grid-cols-[minmax(0,1fr)_9rem_11rem_12rem]"
              : "@5xl:grid-cols-[minmax(0,1fr)_10rem_13rem]",
          )}
        >
          <div className="col-span-2 min-w-0 space-y-2 @5xl:col-span-1">
            <Label htmlFor={`${id}-search`}>{t("jobList.search")}</Label>
            <div className="relative">
              <FontAwesomeIcon
                icon={faMagnifyingGlass}
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                id={`${id}-search`}
                type="search"
                className="h-10 pl-9"
                value={preferences.search}
                placeholder={t(`${namespace}.searchPlaceholder`)}
                aria-describedby={`${id}-search-help`}
                onChange={(event) =>
                  updatePreferences({ search: event.target.value })
                }
              />
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor={`${id}-status`}>
              {t(`${namespace}.statusColumn`)}
            </Label>
            <Select
              value={preferences.filterStatus}
              onValueChange={(filterStatus) =>
                updatePreferences({ filterStatus })
              }
            >
              <SelectTrigger id={`${id}-status`} className={triggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("jobList.allStatuses")}</SelectItem>
                {JOB_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {statusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {kind === "network" && (
            <div className="min-w-0 space-y-2">
              <Label htmlFor={`${id}-domain`}>{t("jobList.domain")}</Label>
              <Select
                value={preferences.filterDomain}
                onValueChange={(filterDomain) =>
                  updatePreferences({ filterDomain })
                }
              >
                <SelectTrigger id={`${id}-domain`} className={triggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-w-[calc(100vw-2rem)]">
                  <SelectItem value="all">{t("jobList.allDomains")}</SelectItem>
                  {[...domains]
                    .sort((a, b) => a[1].localeCompare(b[1]))
                    .map(([value, name]) => (
                      <SelectItem
                        key={value}
                        value={value}
                        className="[overflow-wrap:anywhere]"
                      >
                        {name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div
            className={cn(
              "min-w-0 space-y-2",
              kind === "network" && "col-span-2 @5xl:col-span-1",
            )}
          >
            <Label htmlFor={`${id}-sort`}>{t("jobList.sortBy")}</Label>
            <Select
              value={`${preferences.sortField}:${preferences.sortDirection}`}
              onValueChange={(value) =>
                updatePreferences({
                  sortField: value.startsWith("completed_at")
                    ? "completed_at"
                    : "started_at",
                  sortDirection: value.endsWith("asc") ? "asc" : "desc",
                })
              }
            >
              <SelectTrigger id={`${id}-sort`} className={triggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="started_at:desc">
                  {t("jobList.sort.startedNewest")}
                </SelectItem>
                <SelectItem value="started_at:asc">
                  {t("jobList.sort.startedOldest")}
                </SelectItem>
                <SelectItem value="completed_at:desc">
                  {t("jobList.sort.completedNewest")}
                </SelectItem>
                <SelectItem value="completed_at:asc">
                  {t("jobList.sort.completedOldest")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p
            id={`${id}-search-help`}
            className="text-muted-foreground col-span-full text-xs"
          >
            {t(`${namespace}.searchHelp`)}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <p role="status" className="text-muted-foreground text-sm">
              {isLoading
                ? t("common.loading")
                : t("jobList.resultRange", {
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
                {t("jobList.clearFilters")}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {hasActiveJobs(jobs) && (
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                <span
                  className="size-1.5 rounded-full bg-blue-500"
                  aria-hidden="true"
                />
                {t(`${namespace}.monitoring`)}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={isFetching}
              onClick={onRefresh}
            >
              <FontAwesomeIcon
                icon={faRotate}
                className={cn(
                  isFetching && "animate-spin motion-reduce:animate-none",
                )}
                aria-hidden="true"
              />
              {t("jobList.refresh")}
            </Button>
          </div>
        </div>
        {jobs.length === JOBS_LIMIT && (
          <p className="text-muted-foreground text-xs">
            {t("jobList.recentLimit", { count: JOBS_LIMIT })}
          </p>
        )}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <ErrorDisplay error={error} />
        ) : totalJobs === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-12 text-center">
            <FontAwesomeIcon
              icon={hasFilters ? faMagnifyingGlass : faClock}
              className="text-muted-foreground mb-2 size-8"
              aria-hidden="true"
            />
            <p className="font-medium">
              {t(jobs.length ? "jobList.noMatches" : `${namespace}.noJobs`)}
            </p>
            <p className="text-muted-foreground max-w-md text-sm">
              {t(
                jobs.length
                  ? "jobList.adjustFilters"
                  : `${namespace}.noJobsDescription`,
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden rounded-lg border @5xl:block">
              <Table className="table-fixed">
                <TableCaption className="sr-only">
                  {t(`${namespace}.title`)}
                </TableCaption>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col" className="w-[12%] px-3">
                      {t(`${namespace}.statusColumn`)}
                    </TableHead>
                    <TableHead scope="col" className="w-[23%] px-3">
                      {t("jobList.identifiers")}
                    </TableHead>
                    <TableHead scope="col" className="w-[18%] px-3">
                      {t(`${namespace}.${kind}`)}
                    </TableHead>
                    <TableHead scope="col" className="w-[16%] px-3">
                      {t(
                        kind === "device"
                          ? "deviceJobs.network"
                          : "jobList.domain",
                      )}
                    </TableHead>
                    <TableHead scope="col" className="w-[19%] px-3">
                      {t("jobList.timing")}
                    </TableHead>
                    <TableHead scope="col" className="w-[12%] px-3 text-center">
                      {t("common.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleJobs.map((job) => (
                    <TableRow
                      key={job.id}
                      className="[&>td]:px-3 [&>td]:py-4 [&>td]:align-top"
                    >
                      <TableCell>{renderStatus(job.status)}</TableCell>
                      <TableCell>{renderReferences(job)}</TableCell>
                      <TableCell>{renderPrimary(job)}</TableCell>
                      <TableCell>{renderRelated(job)}</TableCell>
                      <TableCell>{renderTiming(job)}</TableCell>
                      <TableCell>{renderLogs(job)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul
              className="grid gap-4 @2xl:grid-cols-2 @5xl:hidden"
              aria-label={t(`${namespace}.title`)}
            >
              {visibleJobs.map((job) => (
                <li
                  key={job.id}
                  className="flex min-w-0 flex-col gap-4 rounded-lg border p-4 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 basis-36">
                      {renderPrimary(job)}
                    </div>
                    {renderStatus(job.status)}
                  </div>
                  <dl className="min-w-0 space-y-1">
                    <dt className="text-muted-foreground text-xs">
                      {t(
                        kind === "device"
                          ? "deviceJobs.network"
                          : "jobList.domain",
                      )}
                    </dt>
                    <dd>{renderRelated(job)}</dd>
                  </dl>
                  {renderTiming(job, true)}
                  {renderReferences(job)}
                  <div className="mt-auto border-t pt-3">{renderLogs(job)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
        {!isLoading && !error && jobs.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
            <div className="flex items-center gap-2">
              <Label
                htmlFor={`${id}-page-size`}
                className="text-muted-foreground text-xs"
              >
                {t("jobList.itemsPerPage")}
              </Label>
              <Select
                value={String(preferences.itemsPerPage)}
                onValueChange={(value) =>
                  updatePreferences({ itemsPerPage: Number(value) })
                }
              >
                <SelectTrigger id={`${id}-page-size`} className="h-10 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {totalPages > 1 && (
              <nav
                className="flex flex-wrap items-center gap-3"
                aria-label={t("jobList.pagination", {
                  title: t(`${namespace}.title`),
                })}
              >
                <p className="text-muted-foreground text-sm">
                  {t(`${namespace}.pagination.page`)} {page}{" "}
                  {t(`${namespace}.pagination.of`)} {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10"
                    disabled={page === 1}
                    onClick={() => setCurrentPage(page - 1)}
                  >
                    <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
                    {t(`${namespace}.pagination.previous`)}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10"
                    disabled={page === totalPages}
                    onClick={() => setCurrentPage(page + 1)}
                  >
                    {t(`${namespace}.pagination.next`)}
                    <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
                  </Button>
                </div>
              </nav>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
