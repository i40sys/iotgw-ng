import React from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faCircleCheck,
  faCircleXmark,
  faClock,
  faArrowUpRightFromSquare,
} from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";

interface DeploymentStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  executionId?: string;
  flowId?: string;
  status: "RUNNING" | "SUCCESS" | "FAILED" | "PENDING";
  startedAt?: string;
  completedAt?: string;
  message?: string;
  onViewDebug?: () => void;
}

export function DeploymentStatusDialog({
  open,
  onOpenChange,
  executionId,
  flowId,
  status,
  startedAt,
  completedAt,
  message,
  onViewDebug,
}: DeploymentStatusDialogProps) {
  const { t } = useTranslation();

  // Calculate time running
  const calculateTimeRunning = () => {
    if (!startedAt) return "0s";

    const start = new Date(startedAt);
    const end = completedAt ? new Date(completedAt) : new Date();
    const diffMs = end.getTime() - start.getTime();

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getStatusIcon = () => {
    switch (status) {
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

  const getStatusBadge = () => {
    const variant = {
      RUNNING: "default",
      SUCCESS: "success",
      FAILED: "destructive",
      PENDING: "secondary",
    }[status] as "default" | "success" | "destructive" | "secondary";

    const label = {
      RUNNING: t("deployments.status.running"),
      SUCCESS: t("deployments.status.success"),
      FAILED: t("deployments.status.failed"),
      PENDING: t("deployments.status.pending"),
    }[status];

    return (
      <Badge variant={variant} className="px-2 py-1">
        {label}
      </Badge>
    );
  };

  // Auto-refresh timer display while running
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    if (status === "RUNNING" && open) {
      const interval = setInterval(() => {
        // Force re-render to update time display
        forceUpdate();
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [status, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getStatusIcon()}
            {t("deployments.executionStatus")}
          </DialogTitle>
          <DialogDescription>
            {message || t("deployments.executionStatusDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Execution Details */}
          <div className="grid gap-3">
            {/* Execution ID */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm font-medium">
                {t("deployments.executionId")}:
              </span>
              <span className="font-mono text-sm">{executionId || "N/A"}</span>
            </div>

            {/* Flow ID */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm font-medium">
                {t("deployments.flowId")}:
              </span>
              <span className="font-mono text-sm">{flowId || "N/A"}</span>
            </div>

            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm font-medium">
                {t("deployments.status")}:
              </span>
              {getStatusBadge()}
            </div>

            {/* Time Running */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm font-medium">
                {t("deployments.timeRunning")}:
              </span>
              <span
                className={cn(
                  "text-sm font-medium",
                  status === "RUNNING" && "text-blue-600 dark:text-blue-400",
                )}
              >
                {calculateTimeRunning()}
              </span>
            </div>

            {/* Started At */}
            {startedAt && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm font-medium">
                  {t("deployments.startedAt")}:
                </span>
                <span className="text-sm">
                  {new Date(startedAt).toLocaleString()}
                </span>
              </div>
            )}

            {/* Completed At */}
            {completedAt && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm font-medium">
                  {t("deployments.completedAt")}:
                </span>
                <span className="text-sm">
                  {new Date(completedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* Status Message */}
          {status === "FAILED" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/20">
              <p className="text-sm text-red-800 dark:text-red-200">
                {message || t("deployments.executionFailed")}
              </p>
            </div>
          )}

          {status === "SUCCESS" && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/20">
              <p className="text-sm text-green-800 dark:text-green-200">
                {t("deployments.executionSuccess")}
              </p>
            </div>
          )}

          {status === "RUNNING" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/20">
              <div className="flex items-center justify-between">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  {t("deployments.executionInProgress")}
                </p>
                <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                  <FontAwesomeIcon
                    icon={faSpinner}
                    className="h-3 w-3 animate-spin"
                    aria-hidden="true"
                  />
                  <span>Refreshing every 1s</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={status === "RUNNING"}
          >
            {status === "RUNNING" ? t("buttons.close") : t("buttons.done")}
          </Button>

          {onViewDebug && (
            <Button
              variant="secondary"
              onClick={onViewDebug}
              className="flex items-center gap-2"
            >
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="h-4 w-4"
                aria-hidden="true"
              />
              {t("deployments.viewDebugLog")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
