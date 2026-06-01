import { createFileRoute } from "@tanstack/react-router";
import { ErrorDisplay } from "@/components/ui/error-display";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import React, { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faMaximize,
  faMinimize,
  faXmark,
  faSpinner,
  faCircleCheck,
  faCircleXmark,
  faClock,
} from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/devices/debug/$id")({
  errorComponent: ({ error }) => (
    <ErrorDisplay
      error={error instanceof Error ? error : new Error("Unknown error")}
    />
  ),
  pendingComponent: () => <LoadingSpinner />,
  component: DeviceDebugView,
});

interface LogEntry {
  timestamp?: string;
  message?: string;
  thread?: string;
  level?: string;
}

function DeviceDebugView() {
  const { id } = Route.useParams();
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const REFETCH_INTERVAL = 5000; // 5 seconds

  // Fetch device job record
  const jobQuery = useQuery(
    trpc.getDeviceJobByExecutionId.queryOptions({
      execution_id: id,
    }),
  );

  // Check if job is running
  const isRunning = jobQuery.data?.status?.toUpperCase() === "RUNNING";

  // Fetch execution logs with auto-refresh when running
  const logsQuery = useQuery({
    ...trpc.fetchKestraExecutionLogs.queryOptions({
      execution_id: id,
    }),
    refetchInterval: isRunning ? REFETCH_INTERVAL : false,
  });

  // Auto-expand all tasks (including new ones from periodic updates)
  useEffect(() => {
    if (logsQuery.data?.logs && logsQuery.data.logs.length > 0) {
      const allIndices = new Set<number>();
      logsQuery.data.logs.forEach((log, index) => {
        const message = log.message?.toLowerCase() || "";
        if (message.startsWith("task ")) {
          allIndices.add(index);
        }
      });
      if (allIndices.size > 0) {
        setExpandedTasks(allIndices);
      }
    }
  }, [logsQuery.data]);

  // Auto-scroll to bottom when logs update and job is running
  useEffect(() => {
    if (isRunning && bottomRef.current) {
      // Use setTimeout to ensure content is rendered before scrolling
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 100);
    }
  }, [logsQuery.data, isRunning]);

  // Polling for job status when running
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      void jobQuery.refetch();
    }, REFETCH_INTERVAL);

    return () => clearInterval(interval);
  }, [isRunning, jobQuery]);

  const toggleTask = (index: number) => {
    setExpandedTasks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    if (logsQuery.data?.logs) {
      const allIndices = new Set<number>();
      logsQuery.data.logs.forEach((_, index) => {
        const message = logsQuery.data.logs[index].message?.toLowerCase() || "";
        if (message.startsWith("task ")) {
          allIndices.add(index);
        }
      });
      setExpandedTasks(allIndices);
    }
  };

  const collapseAll = () => {
    setExpandedTasks(new Set());
  };

  const getCssClass = (message: string): string => {
    const msgLower = message.toLowerCase();
    if (msgLower.startsWith("play ")) return "text-[#c586c0] font-bold";
    if (msgLower.startsWith("task ")) return "text-[#569cd6]";
    if (msgLower.startsWith("play recap")) return "text-[#c586c0] font-bold";
    if (msgLower.includes("ok=")) return "text-[#4ec9b0]";
    if (msgLower.includes("changed=")) return "text-[#d7ba7d]";
    if (msgLower.includes("fatal:") || msgLower.includes("failed="))
      return "text-[#f44747] font-bold";
    return "text-[#d4d4d4]";
  };

  const getStatusIcon = (status: string) => {
    switch (status.toUpperCase()) {
      case "RUNNING":
        return (
          <FontAwesomeIcon
            icon={faSpinner}
            className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400"
            aria-hidden="true"
          />
        );
      case "SUCCESS":
        return (
          <FontAwesomeIcon
            icon={faCircleCheck}
            className="h-4 w-4 text-green-600 dark:text-green-400"
            aria-hidden="true"
          />
        );
      case "FAILED":
        return (
          <FontAwesomeIcon
            icon={faCircleXmark}
            className="h-4 w-4 text-red-600 dark:text-red-400"
            aria-hidden="true"
          />
        );
      case "PENDING":
      default:
        return (
          <FontAwesomeIcon
            icon={faClock}
            className="h-4 w-4 text-yellow-600 dark:text-yellow-400"
            aria-hidden="true"
          />
        );
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

    return (
      <Badge variant={variant} className={cn("px-2 py-1", colorClasses)}>
        <span className="flex items-center gap-1.5">
          {getStatusIcon(status)}
          {status}
        </span>
      </Badge>
    );
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString();
  };

  const renderLogs = () => {
    if (!logsQuery.data?.logs) return null;

    const logElements: JSX.Element[] = [];
    let i = 0;

    while (i < logsQuery.data.logs.length) {
      const log = logsQuery.data.logs[i];
      const message = log.message || "";

      if (!message.trim()) {
        i++;
        continue;
      }

      // Check if it's a TASK header
      if (message.toLowerCase().startsWith("task ")) {
        const taskIndex = i;
        const isExpanded = expandedTasks.has(taskIndex);

        // Collect task content
        const contentLines: LogEntry[] = [];
        i++;
        while (
          i < logsQuery.data.logs.length &&
          !logsQuery.data.logs[i].message?.toLowerCase().startsWith("task ") &&
          !logsQuery.data.logs[i].message
            ?.toLowerCase()
            .startsWith("play recap")
        ) {
          if (logsQuery.data.logs[i].message?.trim()) {
            contentLines.push(logsQuery.data.logs[i]);
          }
          i++;
        }

        logElements.push(
          <div key={`task-${taskIndex}`} className="mb-1">
            <div
              className={cn(
                "flex cursor-pointer items-start rounded px-2 py-1 font-bold transition-colors hover:bg-[#3a3a3a]",
                isExpanded && "bg-[#3a3a3a]",
              )}
              onClick={() => toggleTask(taskIndex)}
            >
              <FontAwesomeIcon
                icon={faChevronRight}
                className={cn(
                  "mr-2 mt-[2px] h-4 w-4 flex-shrink-0 transition-transform",
                  isExpanded && "rotate-90",
                )}
                aria-hidden="true"
              />
              <span className="w-[250px] flex-shrink-0 pr-4 text-[#888]">
                {log.timestamp || ""}
              </span>
              <span className="whitespace-pre-wrap break-words text-[#569cd6]">
                {message}
              </span>
            </div>
            {isExpanded && contentLines.length > 0 && (
              <div className="ml-1 border-l-2 border-[#444] pl-6">
                {contentLines.map((contentLog, idx) => (
                  <div
                    key={`content-${taskIndex}-${idx}`}
                    className="flex items-start py-[2px]"
                  >
                    <span className="w-[250px] flex-shrink-0 pr-4 text-[#888]">
                      {contentLog.timestamp || ""}
                    </span>
                    <span
                      className={cn(
                        "whitespace-pre-wrap break-words",
                        getCssClass(contentLog.message || ""),
                      )}
                    >
                      {contentLog.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>,
        );
      } else {
        // Regular log line
        logElements.push(
          <div key={`log-${i}`} className="flex items-start py-[2px]">
            <span className="w-[250px] flex-shrink-0 pr-4 text-[#888]">
              {log.timestamp || ""}
            </span>
            <span
              className={cn(
                "whitespace-pre-wrap break-words",
                getCssClass(message),
              )}
            >
              {message}
            </span>
          </div>,
        );
        i++;
      }
    }

    return logElements;
  };

  // Loading state - show spinner if either query is loading
  if (jobQuery.isLoading || logsQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1e1e1e]">
        <LoadingSpinner />
      </div>
    );
  }

  // Error state - show error if job query fails
  if (jobQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1e1e1e]">
        <ErrorDisplay
          error={
            jobQuery.error instanceof Error
              ? jobQuery.error
              : new Error("Failed to fetch device job")
          }
        />
      </div>
    );
  }

  // If logs query fails, we'll show a warning but still display the job metadata
  const logsError = logsQuery.isError ? logsQuery.error : null;
  const job = jobQuery.data;

  return (
    <div className="min-h-screen bg-[#1e1e1e] p-4 font-mono text-[#d4d4d4]">
      <div className="max-w-full">
        {/* Header with Job Metadata */}
        <div className="mb-6 border-b border-[#444] pb-4">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex-1">
              <h1 className="mb-2 text-2xl font-bold">Device Execution Logs</h1>
              <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                <div>
                  <span className="text-[#888]">Device:</span>{" "}
                  <span className="font-medium text-[#d4d4d4]">
                    {job.device_name}
                  </span>
                </div>
                <div>
                  <span className="text-[#888]">IP Address:</span>{" "}
                  <span className="text-[#d4d4d4]">
                    {job.device_ip_address}
                  </span>
                </div>
                <div>
                  <span className="text-[#888]">Network:</span>{" "}
                  <span className="text-[#d4d4d4]">{job.network_name}</span>
                </div>
                <div>
                  <span className="text-[#888]">Description:</span>{" "}
                  <span className="text-[#d4d4d4]">
                    {job.device_description || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-[#888]">Started:</span>{" "}
                  <span className="text-[#d4d4d4]">
                    {formatDate(job.started_at)}
                  </span>
                </div>
                <div>
                  <span className="text-[#888]">Completed:</span>{" "}
                  <span className="text-[#d4d4d4]">
                    {formatDate(job.completed_at)}
                  </span>
                </div>
                <div>
                  <span className="text-[#888]">Status:</span>{" "}
                  {getStatusBadge(job.status)}
                </div>
                <div>
                  <span className="text-[#888]">Execution ID:</span>{" "}
                  <span className="font-mono text-xs text-[#d4d4d4]">{id}</span>
                </div>
              </div>
            </div>
            <div className="ml-4 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={expandAll}
                className="border-[#555] bg-[#3a3a3a] text-[#d4d4d4] hover:bg-[#4a4a4a]"
                title="Expand All Tasks"
              >
                <FontAwesomeIcon
                  icon={faMaximize}
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={collapseAll}
                className="border-[#555] bg-[#3a3a3a] text-[#d4d4d4] hover:bg-[#4a4a4a]"
                title="Collapse All Tasks"
              >
                <FontAwesomeIcon
                  icon={faMinimize}
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              </Button>
              <div className="ml-2 h-6 w-px bg-[#555]" />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.close()}
                className="border-[#555] bg-[#3a3a3a] text-[#d4d4d4] hover:bg-[#4a4a4a]"
                title="Close Window"
              >
                <FontAwesomeIcon
                  icon={faXmark}
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              </Button>
            </div>
          </div>
        </div>

        {/* Log info */}
        {logsQuery.data && (
          <div className="mb-4 text-sm text-[#888]">
            Showing {logsQuery.data.ansibleLogs} Ansible log entries out of{" "}
            {logsQuery.data.totalLogs} total logs
          </div>
        )}

        {/* Error display if logs failed to load */}
        {logsError && (
          <div className="mb-4 rounded border border-[#555] bg-[#3a3a3a] p-4">
            <div className="mb-2 font-semibold text-yellow-500">
              Warning: Failed to load execution logs
            </div>
            <div className="text-sm text-[#d4d4d4]">
              {logsError instanceof Error
                ? logsError.message
                : "Unknown error occurred while fetching logs"}
            </div>
          </div>
        )}

        {/* Log container */}
        <div className="w-full text-sm">
          {logsQuery.data?.logs && logsQuery.data.logs.length > 0 ? (
            <>
              {renderLogs()}
              {/* Bottom anchor for auto-scrolling */}
              <div ref={bottomRef} className="h-1" />
            </>
          ) : logsError ? (
            <div className="py-10 text-center text-[#888]">
              Logs are not available at this time. The job may still be
              initializing.
            </div>
          ) : (
            <div className="py-10 text-center text-[#888]">
              No Ansible logs found for this execution
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
