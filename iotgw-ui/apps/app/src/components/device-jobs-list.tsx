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
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faCircleCheck,
  faCircleXmark,
  faClock,
  faArrowUpRightFromSquare,
  faChevronLeft,
  faChevronRight,
  faRotate,
  faArrowUp,
  faArrowDown,
  faSort,
  faFingerprint,
  faNetworkWired,
  faCalendarCheck,
  faCalendarXmark,
  faHourglass,
  faReceipt,
  faPlay,
  faFilter,
  faServer,
  faFilterCircleXmark,
} from "@fortawesome/free-solid-svg-icons";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import type { Database } from "@iotgw/supabase-contract";

type DeviceJob = Database["public"]["Tables"]["device_jobs"]["Row"];

export interface DeviceJobsListProps {
  /** Optional device ID to filter jobs by device */
  deviceId?: string;
  /** Optional network ID to filter jobs by network */
  networkId?: string;
  /** Additional className for styling */
  className?: string;
  /** Callback when View Logs button is clicked */
  onViewLogs?: (executionId: string) => void;
  /** Whether to show the card header (title and description). Defaults to true */
  showHeader?: boolean;
  /** Initial device name filter (e.g., from URL search params) */
  initialDeviceFilter?: string;
}

const REFETCH_INTERVAL = 5000; // 5 seconds
const STORAGE_KEY = "device-jobs-preferences";

/**
 * Helper function to check if any jobs are in running state
 */
const hasRunningJobs = (jobs: DeviceJob[]): boolean => {
  return jobs.some((job) => job.status.toUpperCase() === "RUNNING");
};

/**
 * Load preferences from localStorage
 */
const loadPreferences = () => {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error("Failed to load preferences:", error);
    return null;
  }
};

/**
 * Save preferences to localStorage
 */
const savePreferences = (preferences: any) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error("Failed to save preferences:", error);
  }
};

export function DeviceJobsList({
  deviceId,
  networkId,
  className,
  onViewLogs,
  showHeader = true,
  initialDeviceFilter,
}: DeviceJobsListProps) {
  const { t } = useTranslation();

  // Load preferences from localStorage on mount
  const preferences = loadPreferences();

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(
    preferences?.itemsPerPage || 10,
  );

  // Filter states - use initialDeviceFilter if provided, otherwise use localStorage
  const [filterStatus, setFilterStatus] = useState<string>(
    preferences?.filterStatus || "all",
  );
  const [filterExecutionOrTransaction, setFilterExecutionOrTransaction] =
    useState(preferences?.filterExecutionOrTransaction || "");
  const [filterDeviceName, setFilterDeviceName] = useState(
    initialDeviceFilter || preferences?.filterDeviceName || "",
  );
  const [filterNetworkName, setFilterNetworkName] = useState<string>(
    preferences?.filterNetworkName || "",
  );

  // Sorting states - default: sort by started_at descending
  const [sortField, setSortField] = useState<"started_at" | "completed_at">(
    preferences?.sortField || "started_at",
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(
    preferences?.sortDirection || "desc",
  );

  // Query device jobs with optional filtering and auto-refresh
  const jobsQuery = useQuery(
    trpc.listDeviceJobs.queryOptions({
      device_id: deviceId,
      network_id: networkId,
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

  // Reset to page 1 if filters change or items per page changes
  useEffect(() => {
    setCurrentPage(1);
  }, [
    deviceId,
    networkId,
    filterDeviceName,
    filterNetworkName,
    filterExecutionOrTransaction,
    filterStatus,
    itemsPerPage,
  ]);

  // Save preferences to localStorage whenever they change
  useEffect(() => {
    savePreferences({
      itemsPerPage,
      filterStatus,
      filterExecutionOrTransaction,
      filterDeviceName,
      filterNetworkName,
      sortField,
      sortDirection,
    });
  }, [
    itemsPerPage,
    filterStatus,
    filterExecutionOrTransaction,
    filterDeviceName,
    filterNetworkName,
    sortField,
    sortDirection,
  ]);

  // Filter and sort jobs
  const processedJobs = useMemo(() => {
    let filtered = jobsQuery.data ?? [];

    // Apply filters
    if (filterStatus && filterStatus !== "all") {
      filtered = filtered.filter(
        (job) => job.status.toUpperCase() === filterStatus.toUpperCase(),
      );
    }

    if (filterExecutionOrTransaction) {
      filtered = filtered.filter((job) => {
        const searchTerm = filterExecutionOrTransaction.toLowerCase();
        const executionIdMatch = job.execution_id
          .toLowerCase()
          .includes(searchTerm);
        const transactionIdMatch = job.transaction_id
          ?.toLowerCase()
          .includes(searchTerm);
        return executionIdMatch || transactionIdMatch;
      });
    }

    if (filterDeviceName) {
      filtered = filtered.filter((job) =>
        job.device_name.toLowerCase().includes(filterDeviceName.toLowerCase()),
      );
    }

    if (filterNetworkName) {
      filtered = filtered.filter((job) =>
        job.network_name
          .toLowerCase()
          .includes(filterNetworkName.toLowerCase()),
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      // Handle null values - put them at the end
      if (!aValue && !bValue) return 0;
      if (!aValue) return 1;
      if (!bValue) return -1;

      const aTime = new Date(aValue).getTime();
      const bTime = new Date(bValue).getTime();

      if (sortDirection === "asc") {
        return aTime - bTime;
      } else {
        return bTime - aTime;
      }
    });

    return sorted;
  }, [
    jobsQuery.data,
    filterStatus,
    filterExecutionOrTransaction,
    filterDeviceName,
    filterNetworkName,
    sortField,
    sortDirection,
  ]);

  // Calculate pagination
  const totalJobs = processedJobs.length;
  const totalPages = Math.ceil(totalJobs / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedJobs = processedJobs.slice(startIndex, endIndex);
  const showPagination = totalJobs > itemsPerPage;

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
        return t("deviceJobs.status.running");
      case "SUCCESS":
        return t("deviceJobs.status.success");
      case "FAILED":
        return t("deviceJobs.status.failed");
      case "PENDING":
        return t("deviceJobs.status.pending");
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
        RUNNING: t("deviceJobs.status.running"),
        SUCCESS: t("deviceJobs.status.success"),
        FAILED: t("deviceJobs.status.failed"),
        PENDING: t("deviceJobs.status.pending"),
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

  const calculateDuration = (
    startedAt: string | null,
    completedAt: string | null,
  ) => {
    if (!startedAt || !completedAt) return null;

    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    const durationMs = end - start;

    if (durationMs < 0) return null;

    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      const remainingSeconds = seconds % 60;
      return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const shortenUUID = (uuid: string) => {
    // Show first 8 characters of UUID
    return uuid.slice(0, 8);
  };

  const handleSort = (field: "started_at" | "completed_at") => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new field with descending as default
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const getSortIcon = (field: "started_at" | "completed_at") => {
    if (sortField !== field) {
      return (
        <FontAwesomeIcon
          icon={faSort}
          className="text-muted-foreground ml-1 h-3 w-3"
        />
      );
    }
    return (
      <FontAwesomeIcon
        icon={sortDirection === "asc" ? faArrowUp : faArrowDown}
        className="ml-1 h-3 w-3"
      />
    );
  };

  const handleResetFilters = () => {
    setFilterStatus("all");
    setFilterExecutionOrTransaction("");
    setFilterDeviceName("");
    setFilterNetworkName("");
    setSortField("started_at");
    setSortDirection("desc");
  };

  const handleViewLogs = (job: DeviceJob) => {
    if (onViewLogs) {
      onViewLogs(job.execution_id);
    } else {
      // Default behavior: open debug view in new tab
      const debugUrl = `/devices/debug/${job.execution_id}`;
      window.open(debugUrl, "_blank");
    }
  };

  // Loading state
  if (jobsQuery.isLoading) {
    return (
      <Card className={className}>
        {showHeader && (
          <CardHeader>
            <CardTitle>{t("deviceJobs.title")}</CardTitle>
            <CardDescription>{t("deviceJobs.description")}</CardDescription>
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
            <CardTitle>{t("deviceJobs.title")}</CardTitle>
            <CardDescription>{t("deviceJobs.description")}</CardDescription>
          </CardHeader>
        )}
        <CardContent>
          <ErrorDisplay
            error={
              jobsQuery.error instanceof Error
                ? jobsQuery.error
                : new Error("Failed to load device jobs")
            }
          />
        </CardContent>
      </Card>
    );
  }

  // Empty state - check raw data, not filtered
  const rawJobs = jobsQuery.data ?? [];
  if (rawJobs.length === 0) {
    return (
      <Card className={className}>
        {showHeader && (
          <CardHeader>
            <CardTitle>{t("deviceJobs.title")}</CardTitle>
            <CardDescription>{t("deviceJobs.description")}</CardDescription>
          </CardHeader>
        )}
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FontAwesomeIcon
              icon={faClock}
              className="text-muted-foreground mb-4 h-12 w-12"
              aria-hidden="true"
            />
            <p className="text-muted-foreground text-lg font-medium">
              {t("deviceJobs.noJobs")}
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              {deviceId
                ? t("deviceJobs.noJobsForDevice")
                : t("deviceJobs.noJobsDescription")}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Table with data
  return (
    <Card className={className}>
      {showHeader && (
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle>{t("deviceJobs.title")}</CardTitle>
              <CardDescription>
                {t("deviceJobs.description")}
                {deviceId && ` - ${t("deviceJobs.filteredByDevice")}`}
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
                  {t("deviceJobs.monitoring")}
                </span>
              </div>
            )}
          </div>
        </CardHeader>
      )}
      <CardContent>
        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end">
          <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-12">
            {/* Status filter - smaller width */}
            <div className="md:col-span-2">
            <label
              htmlFor="filter-status"
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
            >
              <FontAwesomeIcon
                icon={faFilter}
                className="text-muted-foreground h-3.5 w-3.5"
              />
              Status
            </label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger id="filter-status" className="w-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="RUNNING">Running</SelectItem>
                <SelectItem value="SUCCESS">Success</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Transaction/Execution ID filter - medium width */}
          <div className="md:col-span-3">
            <label
              htmlFor="filter-exec-tx-id"
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
            >
              <FontAwesomeIcon
                icon={faFingerprint}
                className="text-muted-foreground h-3.5 w-3.5"
              />
              Transaction/Execution ID
            </label>
            <Input
              id="filter-exec-tx-id"
              placeholder="Search by TX or Exec ID..."
              value={filterExecutionOrTransaction}
              onChange={(e) => setFilterExecutionOrTransaction(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Device name filter - medium width */}
          <div className="md:col-span-3">
            <label
              htmlFor="filter-device-name"
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
            >
              <FontAwesomeIcon
                icon={faServer}
                className="text-muted-foreground h-3.5 w-3.5"
              />
              Device Name
            </label>
            <Input
              id="filter-device-name"
              placeholder="Search device..."
              value={filterDeviceName}
              onChange={(e) => setFilterDeviceName(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Network name filter - medium width */}
          <div className="md:col-span-4">
            <label
              htmlFor="filter-network-name"
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
            >
              <FontAwesomeIcon
                icon={faNetworkWired}
                className="text-muted-foreground h-3.5 w-3.5"
              />
              Network Name
            </label>
            <Input
              id="filter-network-name"
              placeholder="Search network..."
              value={filterNetworkName}
              onChange={(e) => setFilterNetworkName(e.target.value)}
              className="w-full"
            />
          </div>
          </div>

          {/* Reset Filters Button */}
          <Button
            variant="outline"
            size="default"
            onClick={handleResetFilters}
            className="flex items-center gap-2 whitespace-nowrap"
          >
            <FontAwesomeIcon
              icon={faFilterCircleXmark}
              className="h-4 w-4"
              aria-hidden="true"
            />
            Reset Filters
          </Button>
        </div>

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
                          icon={faReceipt}
                          className="text-muted-foreground h-3.5 w-3.5"
                        />
                        Transaction ID
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Edge Manager UI ID</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
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
                <TableHead>
                  <div className="flex items-center gap-1.5">
                    <FontAwesomeIcon
                      icon={faServer}
                      className="text-muted-foreground h-3.5 w-3.5"
                    />
                    {t("deviceJobs.device")}
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center gap-1.5">
                    <FontAwesomeIcon
                      icon={faNetworkWired}
                      className="text-muted-foreground h-3.5 w-3.5"
                    />
                    {t("deviceJobs.network")}
                  </div>
                </TableHead>
                <TableHead
                  className="hover:bg-muted/50 cursor-pointer select-none transition-colors"
                  onClick={() => handleSort("started_at")}
                >
                  <div className="flex items-center gap-1.5">
                    <FontAwesomeIcon
                      icon={faCalendarCheck}
                      className="text-muted-foreground h-3.5 w-3.5"
                    />
                    {t("deviceJobs.startedAt")}
                    {getSortIcon("started_at")}
                  </div>
                </TableHead>
                <TableHead
                  className="hover:bg-muted/50 cursor-pointer select-none transition-colors"
                  onClick={() => handleSort("completed_at")}
                >
                  <div className="flex items-center gap-1.5">
                    <FontAwesomeIcon
                      icon={faCalendarXmark}
                      className="text-muted-foreground h-3.5 w-3.5"
                    />
                    {t("deviceJobs.completedAt")}
                    {getSortIcon("completed_at")}
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  {t("common.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    <div className="text-muted-foreground flex flex-col items-center justify-center">
                      <p className="text-sm">No jobs match your filters</p>
                      <p className="mt-1 text-xs">
                        Try adjusting your search criteria
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedJobs.map((job) => (
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
                            {job.transaction_id
                              ? shortenUUID(job.transaction_id)
                              : "N/A"}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-mono text-xs">
                            {job.transaction_id || "N/A"}
                          </p>
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
                      {job.network_name ? (
                        <Link
                          to="/networks"
                          search={{ networkName: job.network_name }}
                          className="cursor-pointer font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {job.network_name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatDate(job.started_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="text-sm">
                          {formatDate(job.completed_at)}
                        </div>
                        {job.completed_at &&
                          calculateDuration(
                            job.started_at,
                            job.completed_at,
                          ) && (
                            <div className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                              <FontAwesomeIcon
                                icon={faHourglass}
                                className="h-3 w-3"
                              />
                              {calculateDuration(
                                job.started_at,
                                job.completed_at,
                              )}
                            </div>
                          )}
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
                          {t("deviceJobs.viewLogs")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        {showPagination && (
          <div className="mt-4 flex flex-col items-center justify-between gap-4 border-t pt-4 sm:flex-row">
            <div className="order-2 flex items-center gap-3 text-sm sm:order-1">
              <div className="text-muted-foreground">
                {t("deviceJobs.pagination.showing")} {startIndex + 1}{" "}
                {t("deviceJobs.pagination.to")} {Math.min(endIndex, totalJobs)}{" "}
                {t("deviceJobs.pagination.of")} {totalJobs}{" "}
                {t("deviceJobs.pagination.jobs")}
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="items-per-page"
                  className="text-muted-foreground whitespace-nowrap text-xs"
                >
                  Items per page:
                </label>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => setItemsPerPage(Number(value))}
                >
                  <SelectTrigger id="items-per-page" className="h-8 w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="250">250</SelectItem>
                    <SelectItem value="500">500</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                  {t("deviceJobs.pagination.previous")}
                </span>
              </Button>
              <div className="px-2 text-sm font-medium">
                {t("deviceJobs.pagination.page")} {currentPage}{" "}
                {t("deviceJobs.pagination.of")} {totalPages}
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
                  {t("deviceJobs.pagination.next")}
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
      </CardContent>
    </Card>
  );
}
