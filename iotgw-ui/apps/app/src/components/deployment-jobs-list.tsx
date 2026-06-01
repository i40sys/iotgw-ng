import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
  faPlay,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
const REFETCH_INTERVAL = 5000; // 5 seconds

/**
 * Helper function to check if any jobs are in running state
 */
const hasRunningJobs = (jobs: DeploymentJob[]): boolean => {
  return jobs.some((job) => job.status.toUpperCase() === "RUNNING");
};

export function DeploymentJobsList({
  deviceId,
  className,
  onViewLogs,
  onViewConfig,
  showHeader = true,
  maxItems,
}: DeploymentJobsListProps) {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<{
    config: unknown;
    name: string;
    version: string;
  } | null>(null);

  // Filter states
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDeviceName, setFilterDeviceName] = useState("");
  const [filterNetworkName, setFilterNetworkName] = useState("");
  const [filterDomainName, setFilterDomainName] = useState("");
  const [filterDeploymentName, setFilterDeploymentName] = useState("");

  // Query deployment jobs with optional device filtering and auto-refresh
  const jobsQuery = useQuery(
    trpc.listDeploymentJobs.queryOptions({
      device_id: deviceId,
      limit: 100, // Fetch more to support pagination
    }),
  );

  // Determine if polling should be active based on job statuses
  const shouldPoll = useMemo(() => {
    return hasRunningJobs(jobsQuery.data ?? []);
  }, [jobsQuery.data]);

  // Enable refetching with interval when there are running jobs
  useEffect(() => {
    if (!shouldPoll) {
      return;
    }

    const interval = setInterval(() => {
      void jobsQuery.refetch();
    }, REFETCH_INTERVAL);

    return () => clearInterval(interval);
  }, [shouldPoll, jobsQuery]);

  // Reset to page 1 if device changes
  useEffect(() => {
    setCurrentPage(1);
  }, [deviceId]);

  // Reset filters function
  const handleResetFilters = () => {
    setFilterStatus("all");
    setFilterDeviceName("");
    setFilterNetworkName("");
    setFilterDomainName("");
    setFilterDeploymentName("");
  };

  // Render filters section (memoized to prevent re-creation and focus loss)
  const renderFilters = useMemo(
    () =>
      !maxItems ? (
        <div className="mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Filters</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="h-8 gap-2"
            >
              <FontAwesomeIcon
                icon={faFilterCircleXmark}
                className="h-4 w-4"
                aria-hidden="true"
              />
              Reset Filters
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
            {/* Status Filter */}
            <div className="space-y-2">
              <Label htmlFor="status-filter">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger id="status-filter">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="RUNNING">Running</SelectItem>
                  <SelectItem value="SUCCESS">Success</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Device Name Filter */}
            <div className="space-y-2">
              <Label htmlFor="device-filter">Device</Label>
              <Input
                id="device-filter"
                type="text"
                placeholder="Filter by device..."
                value={filterDeviceName}
                onChange={(e) => setFilterDeviceName(e.target.value)}
              />
            </div>

            {/* Network Name Filter */}
            <div className="space-y-2">
              <Label htmlFor="network-filter">Network</Label>
              <Input
                id="network-filter"
                type="text"
                placeholder="Filter by network..."
                value={filterNetworkName}
                onChange={(e) => setFilterNetworkName(e.target.value)}
              />
            </div>

            {/* Domain Name Filter */}
            <div className="space-y-2">
              <Label htmlFor="domain-filter">Domain</Label>
              <Input
                id="domain-filter"
                type="text"
                placeholder="Filter by domain..."
                value={filterDomainName}
                onChange={(e) => setFilterDomainName(e.target.value)}
              />
            </div>

            {/* Deployment Name Filter */}
            <div className="space-y-2">
              <Label htmlFor="deployment-filter">Deployment</Label>
              <Input
                id="deployment-filter"
                type="text"
                placeholder="Filter by deployment..."
                value={filterDeploymentName}
                onChange={(e) => setFilterDeploymentName(e.target.value)}
              />
            </div>
          </div>
        </div>
      ) : null,
    [
      maxItems,
      filterStatus,
      filterDeviceName,
      filterNetworkName,
      filterDomainName,
      filterDeploymentName,
      handleResetFilters,
    ],
  );

  // Calculate jobs and pagination - BEFORE any returns
  const allJobs = jobsQuery.data ?? [];

  // Apply filters
  const filteredJobs = allJobs.filter((job) => {
    // Status filter
    if (filterStatus !== "all" && job.status.toUpperCase() !== filterStatus) {
      return false;
    }

    // Device name filter
    if (
      filterDeviceName &&
      !job.device_name.toLowerCase().includes(filterDeviceName.toLowerCase())
    ) {
      return false;
    }

    // Network name filter
    if (
      filterNetworkName &&
      !job.network_name.toLowerCase().includes(filterNetworkName.toLowerCase())
    ) {
      return false;
    }

    // Domain name filter
    if (
      filterDomainName &&
      !job.domain_name.toLowerCase().includes(filterDomainName.toLowerCase())
    ) {
      return false;
    }

    // Deployment name filter
    if (
      filterDeploymentName &&
      !job.deployment_name
        .toLowerCase()
        .includes(filterDeploymentName.toLowerCase())
    ) {
      return false;
    }

    return true;
  });

  const jobs = filteredJobs;
  const totalJobs = jobs.length;

  // If maxItems is set, show only that many items without pagination
  const displayJobs = maxItems ? jobs.slice(0, maxItems) : jobs;
  const showViewAllButton = maxItems && totalJobs > maxItems;

  // Only use pagination when maxItems is not set
  const totalPages = maxItems ? 1 : Math.ceil(totalJobs / JOBS_PER_PAGE);
  const startIndex = maxItems ? 0 : (currentPage - 1) * JOBS_PER_PAGE;
  const endIndex = maxItems ? maxItems : startIndex + JOBS_PER_PAGE;
  const paginatedJobs = maxItems ? displayJobs : jobs.slice(startIndex, endIndex);
  const showPagination = !maxItems && totalJobs > JOBS_PER_PAGE;

  const getStatusIcon = (status: string) => {
    switch (status.toUpperCase()) {
      case "RUNNING":
        return (
          <FontAwesomeIcon
            icon={faSpinner}
            className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400"
            aria-hidden="true"
          />
        );
      case "SUCCESS":
        return (
          <FontAwesomeIcon
            icon={faCircleCheck}
            className="h-5 w-5 text-green-600 dark:text-green-400"
            aria-hidden="true"
          />
        );
      case "FAILED":
        return (
          <FontAwesomeIcon
            icon={faCircleXmark}
            className="h-5 w-5 text-red-600 dark:text-red-400"
            aria-hidden="true"
          />
        );
      case "PENDING":
      default:
        return (
          <FontAwesomeIcon
            icon={faClock}
            className="h-5 w-5 text-yellow-600 dark:text-yellow-400"
            aria-hidden="true"
          />
        );
    }
  };

  const getStatusTooltip = (status: string) => {
    switch (status.toUpperCase()) {
      case "RUNNING":
        return t("deploymentJobs.status.running");
      case "SUCCESS":
        return t("deploymentJobs.status.success");
      case "FAILED":
        return t("deploymentJobs.status.failed");
      case "PENDING":
        return t("deploymentJobs.status.pending");
      default:
        return status;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusUpper = status.toUpperCase();
    const variant = {
      RUNNING: "default",
      SUCCESS: "secondary",
      FAILED: "destructive",
      PENDING: "outline",
    }[statusUpper] as
      | "default"
      | "secondary"
      | "destructive"
      | "outline"
      | undefined;

    const colorClasses =
      {
        RUNNING:
          "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300 dark:border-blue-700",
        SUCCESS:
          "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-300 dark:border-green-700",
        FAILED:
          "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-300 dark:border-red-700",
        PENDING:
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700",
      }[statusUpper] ?? "";

    const label =
      {
        RUNNING: t("deploymentJobs.status.running"),
        SUCCESS: t("deploymentJobs.status.success"),
        FAILED: t("deploymentJobs.status.failed"),
        PENDING: t("deploymentJobs.status.pending"),
      }[statusUpper] ?? status;

    return (
      <Badge variant={variant} className={cn("px-2 py-1", colorClasses)}>
        <span className="flex items-center gap-1.5">
          {getStatusIcon(status)}
          {label}
        </span>
      </Badge>
    );
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString();
  };

  const shortenUUID = (uuid: string) => {
    // Show first 8 characters of UUID
    return uuid.slice(0, 8);
  };

  const handleViewLogs = (job: DeploymentJob) => {
    if (onViewLogs) {
      onViewLogs(job.execution_id);
    } else {
      // Default behavior: open debug view in new tab
      const debugUrl = `/deployments/debug/${job.execution_id}`;
      window.open(debugUrl, "_blank");
    }
  };

  const handleViewConfig = (job: DeploymentJob) => {
    if (onViewConfig) {
      onViewConfig(job.configuration_json);
    } else {
      // Default behavior: open config viewer modal
      setSelectedConfig({
        config: job.configuration_json,
        name: job.deployment_name,
        version: job.deployment_version,
      });
      setConfigModalOpen(true);
    }
  };

  // Loading state
  if (jobsQuery.isLoading) {
    return (
      <Card className={className}>
        {showHeader && (
          <CardHeader>
            <CardTitle>{t("deploymentJobs.title")}</CardTitle>
            <CardDescription>{t("deploymentJobs.description")}</CardDescription>
          </CardHeader>
        )}
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (jobsQuery.isError) {
    return (
      <Card className={className}>
        {showHeader && (
          <CardHeader>
            <CardTitle>{t("deploymentJobs.title")}</CardTitle>
            <CardDescription>{t("deploymentJobs.description")}</CardDescription>
          </CardHeader>
        )}
        <CardContent>
          <ErrorDisplay
            error={
              jobsQuery.error instanceof Error
                ? jobsQuery.error
                : new Error("Failed to load deployment jobs")
            }
          />
        </CardContent>
      </Card>
    );
  }

  // Empty state (with filters)
  if (jobs.length === 0) {
    return (
      <Card className={className}>
        {showHeader && (
          <CardHeader>
            <CardTitle>{t("deploymentJobs.title")}</CardTitle>
            <CardDescription>{t("deploymentJobs.description")}</CardDescription>
          </CardHeader>
        )}
        <CardContent>
          {renderFilters}
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FontAwesomeIcon
              icon={faClock}
              className="text-muted-foreground mb-4 h-12 w-12"
              aria-hidden="true"
            />
            <p className="text-muted-foreground text-lg font-medium">
              {allJobs.length === 0
                ? t("deploymentJobs.noJobs")
                : "No jobs match the current filters"}
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              {allJobs.length === 0
                ? deviceId
                  ? t("deploymentJobs.noJobsForDevice")
                  : t("deploymentJobs.noJobsDescription")
                : "Try adjusting your filters to see more results"}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Table with data
  return (
    <TooltipProvider>
      <Card className={className}>
        {showHeader && (
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle>{t("deploymentJobs.title")}</CardTitle>
                <CardDescription>
                  {t("deploymentJobs.description")}
                  {deviceId && ` - ${t("deploymentJobs.filteredByDevice")}`}
                </CardDescription>
              </div>
              {shouldPoll && (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <FontAwesomeIcon
                    icon={faRotate}
                    className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400"
                    aria-hidden="true"
                  />
                  <span className="hidden sm:inline">
                    {t("deploymentJobs.monitoring")}
                  </span>
                </div>
              )}
            </div>
          </CardHeader>
        )}
        <CardContent>
          {renderFilters}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5 cursor-help">
                          <FontAwesomeIcon
                            icon={faPlay}
                            className="text-muted-foreground h-3.5 w-3.5"
                          />
                          Execution ID
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Kestra Execution ID</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead>{t("deploymentJobs.device")}</TableHead>
                  <TableHead>{t("deploymentJobs.network")}</TableHead>
                  <TableHead>{t("deploymentJobs.domain")}</TableHead>
                  <TableHead>{t("deploymentJobs.deployment")}</TableHead>
                  <TableHead>{t("deploymentJobs.startedAt")}</TableHead>
                  <TableHead>{t("deploymentJobs.completedAt")}</TableHead>
                  <TableHead className="text-right">
                    {t("common.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="inline-flex cursor-help items-center justify-center">
                            {getStatusIcon(job.status)}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{getStatusTooltip(job.status)}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground hover:text-foreground cursor-help font-mono text-sm transition-colors">
                            {shortenUUID(job.execution_id)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-mono text-xs">
                            {job.execution_id}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{job.device_name}</div>
                        <div className="text-muted-foreground text-sm">
                          {job.device_ip_address}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{job.network_name}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{job.domain_display_name}</div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{job.deployment_name}</div>
                        <div className="text-muted-foreground text-sm">
                          v{job.deployment_version}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{formatDate(job.started_at)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatDate(job.completed_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewLogs(job)}
                          className="flex items-center gap-1.5"
                        >
                          <FontAwesomeIcon
                            icon={faArrowUpRightFromSquare}
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          {t("deploymentJobs.viewLogs")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewConfig(job)}
                          className="flex items-center gap-1.5"
                        >
                          <FontAwesomeIcon
                            icon={faFileCode}
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          {t("deploymentJobs.viewConfig")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

        {/* Pagination Controls */}
        {showPagination && (
          <div className="mt-4 flex flex-col items-center justify-between gap-4 border-t pt-4 sm:flex-row">
            <div className="text-muted-foreground order-2 text-sm sm:order-1">
              {t("deploymentJobs.pagination.showing")} {startIndex + 1}{" "}
              {t("deploymentJobs.pagination.to")}{" "}
              {Math.min(endIndex, totalJobs)}{" "}
              {t("deploymentJobs.pagination.of")} {totalJobs}{" "}
              {t("deploymentJobs.pagination.jobs")}
            </div>
            <div className="order-1 flex items-center gap-2 sm:order-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-1"
              >
                <FontAwesomeIcon
                  icon={faChevronLeft}
                  className="h-4 w-4"
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">
                  {t("deploymentJobs.pagination.previous")}
                </span>
              </Button>
              <div className="px-2 text-sm font-medium">
                {t("deploymentJobs.pagination.page")} {currentPage}{" "}
                {t("deploymentJobs.pagination.of")} {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={currentPage === totalPages}
                className="flex items-center gap-1"
              >
                <span className="hidden sm:inline">
                  {t("deploymentJobs.pagination.next")}
                </span>
                <FontAwesomeIcon
                  icon={faChevronRight}
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              </Button>
            </div>
          </div>
        )}

        {/* View All Button (shown when maxItems is set) */}
        {showViewAllButton && (
          <div className="mt-4 flex items-center justify-center border-t pt-4">
            <Button variant="outline" size="sm" asChild>
              <Link
                to="/deployments/jobs"
                search={{ deviceId }}
                className="flex items-center gap-2"
              >
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="h-4 w-4"
                  aria-hidden="true"
                />
                View All {totalJobs} Deployment Jobs
              </Link>
            </Button>
          </div>
        )}
      </CardContent>

        {/* Configuration Viewer Modal */}
        <DeploymentConfigViewer
          open={configModalOpen}
          onOpenChange={setConfigModalOpen}
          configuration={selectedConfig?.config ?? {}}
          deploymentName={selectedConfig?.name}
          deploymentVersion={selectedConfig?.version}
        />
      </Card>
    </TooltipProvider>
  );
}
