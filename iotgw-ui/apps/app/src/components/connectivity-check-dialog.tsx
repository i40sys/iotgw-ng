import React, { useState, useEffect } from "react";
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
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faCircleCheck,
  faCircleXmark,
  faWifi,
  faServer,
  faKey,
} from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";

interface ConnectivityResult {
  success: boolean;
  executionId?: string;
  ping: {
    success: boolean;
    error?: string;
    rawOutput: string;
    latency?: number;
  };
  ansible: {
    success: boolean;
    error?: string;
    rawOutput: string;
  };
}

interface ConnectivityCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isChecking: boolean;
  result: ConnectivityResult | null;
  deviceName?: string;
  deviceIp?: string;
  sshKeyId?: string | null;
}

type StepStatus = "pending" | "checking" | "success" | "failed";

export function ConnectivityCheckDialog({
  open,
  onOpenChange,
  isChecking,
  result,
  deviceName,
  deviceIp,
  sshKeyId,
}: ConnectivityCheckDialogProps) {
  const { t } = useTranslation();

  // Local state for progressive display
  const [displayedPingResult, setDisplayedPingResult] = useState<ConnectivityResult["ping"] | null>(null);
  const [displayedAnsibleResult, setDisplayedAnsibleResult] = useState<ConnectivityResult["ansible"] | null>(null);
  const [showOverallResult, setShowOverallResult] = useState(false);

  // Reset state when dialog opens or checking starts
  useEffect(() => {
    if (isChecking || !open) {
      setDisplayedPingResult(null);
      setDisplayedAnsibleResult(null);
      setShowOverallResult(false);
    }
  }, [isChecking, open]);

  // Progressive reveal when results arrive
  useEffect(() => {
    if (result && !isChecking) {
      // Step 1: Show ping result immediately
      setDisplayedPingResult(result.ping);

      // Step 2: Show ansible result after a delay
      const ansibleTimer = setTimeout(() => {
        setDisplayedAnsibleResult(result.ansible);
      }, 500);

      // Step 3: Show overall result after ansible
      const overallTimer = setTimeout(() => {
        setShowOverallResult(true);
      }, 1000);

      return () => {
        clearTimeout(ansibleTimer);
        clearTimeout(overallTimer);
      };
    }
  }, [result, isChecking]);

  // Determine step statuses based on displayed state
  const getPingStatus = (): StepStatus => {
    if (displayedPingResult) {
      return displayedPingResult.success ? "success" : "failed";
    }
    if (isChecking) return "checking";
    return "pending";
  };

  const getAnsibleStatus = (): StepStatus => {
    if (displayedAnsibleResult) {
      return displayedAnsibleResult.success ? "success" : "failed";
    }
    // Show checking state after ping result is displayed
    if (displayedPingResult && !displayedAnsibleResult) {
      return "checking";
    }
    return "pending";
  };

  const pingStatus = getPingStatus();
  const ansibleStatus = getAnsibleStatus();

  const getStepIcon = (status: StepStatus) => {
    switch (status) {
      case "checking":
        return (
          <FontAwesomeIcon
            icon={faSpinner}
            className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400"
            aria-hidden="true"
          />
        );
      case "success":
        return (
          <FontAwesomeIcon
            icon={faCircleCheck}
            className="h-5 w-5 text-green-600 dark:text-green-400"
            aria-hidden="true"
          />
        );
      case "failed":
        return (
          <FontAwesomeIcon
            icon={faCircleXmark}
            className="h-5 w-5 text-red-600 dark:text-red-400"
            aria-hidden="true"
          />
        );
      case "pending":
      default:
        return (
          <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
        );
    }
  };

  const getStepClasses = (status: StepStatus) => {
    switch (status) {
      case "checking":
        return "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20";
      case "success":
        return "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20";
      case "failed":
        return "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20";
      case "pending":
      default:
        return "border-muted bg-muted/20";
    }
  };

  const overallSuccess = result?.success ?? false;
  const isComplete = showOverallResult && result !== null;
  const hasSshKey = Boolean(sshKeyId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FontAwesomeIcon
              icon={faWifi}
              className={cn(
                "h-5 w-5",
                isChecking || !showOverallResult
                  ? "text-blue-600 dark:text-blue-400"
                  : overallSuccess
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
              )}
              aria-hidden="true"
            />
            {t("deployments.connectivityCheck.title")}
          </DialogTitle>
          <DialogDescription>
            {deviceName && deviceIp
              ? t("deployments.connectivityCheck.checkingDevice", {
                  name: deviceName,
                  ip: deviceIp,
                })
              : t("deployments.connectivityCheck.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Preflight: SSH Key Status */}
          <div
            className={cn(
              "rounded-lg border p-4 transition-all duration-300",
              hasSshKey
                ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20"
                : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"
            )}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <FontAwesomeIcon
                  icon={faKey}
                  className={cn(
                    "h-5 w-5",
                    hasSshKey
                      ? "text-green-600 dark:text-green-400"
                      : "text-amber-600 dark:text-amber-400"
                  )}
                  aria-hidden="true"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium">
                  {t("devices.sshKey.sectionTitle")}
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hasSshKey
                    ? t("devices.sshKey.configured")
                    : t("devices.sshKey.notConfigured")}
                </p>
                {hasSshKey ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-semibold">
                      {t("devices.sshKey.keyId")}:
                    </span>{" "}
                    <span className="font-mono">{sshKeyId}</span>
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("devices.sshKey.willBeGenerated")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Step 1: Network Reachability (ICMP Ping) */}
          <div
            className={cn(
              "rounded-lg border p-4 transition-all duration-300",
              getStepClasses(pingStatus)
            )}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{getStepIcon(pingStatus)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon
                    icon={faWifi}
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <h4 className="font-medium">
                    {t("deployments.connectivityCheck.networkReachability")}
                  </h4>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("deployments.connectivityCheck.networkReachabilityDesc")}
                </p>
                {/* Show latency if available */}
                {displayedPingResult?.success && displayedPingResult.latency !== undefined && (
                  <p className="mt-2 text-sm font-medium text-green-700 dark:text-green-300">
                    {t("deployments.connectivityCheck.latency", {
                      ms: displayedPingResult.latency.toFixed(1),
                    })}
                  </p>
                )}
                {/* Show error if failed */}
                {displayedPingResult && !displayedPingResult.success && displayedPingResult.error && (
                  <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                    {displayedPingResult.error}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Step 2: Device Access (Ansible Ping) */}
          <div
            className={cn(
              "rounded-lg border p-4 transition-all duration-300",
              getStepClasses(ansibleStatus)
            )}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{getStepIcon(ansibleStatus)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon
                    icon={faServer}
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <h4 className="font-medium">
                    {t("deployments.connectivityCheck.deviceAccess")}
                  </h4>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("deployments.connectivityCheck.deviceAccessDesc")}
                </p>
                {/* Show success message */}
                {displayedAnsibleResult?.success && (
                  <p className="mt-2 text-sm font-medium text-green-700 dark:text-green-300">
                    {t("deployments.connectivityCheck.sshAccessOk")}
                  </p>
                )}
                {/* Show error if failed */}
                {displayedAnsibleResult && !displayedAnsibleResult.success && displayedAnsibleResult.error && (
                  <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                    {displayedAnsibleResult.error}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Overall Result Summary */}
          {isComplete && (
            <div
              className={cn(
                "rounded-lg border p-3 text-center transition-all duration-300",
                overallSuccess
                  ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20"
                  : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20"
              )}
            >
              <div className="flex items-center justify-center gap-2">
                <FontAwesomeIcon
                  icon={overallSuccess ? faCircleCheck : faCircleXmark}
                  className={cn(
                    "h-5 w-5",
                    overallSuccess
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "font-medium",
                    overallSuccess
                      ? "text-green-800 dark:text-green-200"
                      : "text-red-800 dark:text-red-200"
                  )}
                >
                  {overallSuccess
                    ? t("deployments.connectivityCheck.deviceOnline")
                    : t("deployments.connectivityCheck.deviceOffline")}
                </span>
              </div>
            </div>
          )}

          {/* Execution ID */}
          {result?.executionId && showOverallResult && (
            <p className="text-center text-xs text-muted-foreground">
              {t("deployments.steps.moreDetailsAt")}{" "}
              <span className="font-mono font-semibold">
                #{result.executionId}
              </span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isChecking}
          >
            {isChecking ? t("buttons.checking") : t("buttons.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
