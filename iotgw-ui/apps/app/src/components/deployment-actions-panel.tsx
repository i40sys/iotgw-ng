import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRotateLeft,
  faPlus,
  faFloppyDisk,
  faRocket,
  faTrash,
  faDownload,
  faWifi,
  faCircleCheck,
  faCircleXmark,
} from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";
import type { DeploymentStep } from "@/components/deployment-step-tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ConnectivityResult {
  success: boolean;
  executionId?: string;
  ping: { success: boolean; error?: string; rawOutput: string; latency?: number };
  ansible: { success: boolean; error?: string; rawOutput: string };
}

interface DeploymentActionsPanelProps {
  /** Selected device ID */
  selectedDeviceId?: string;
  /** Whether form has unsaved changes */
  hasUnsavedChanges: boolean;
  /** Whether any async operation is in progress */
  isLoading: boolean;
  /** Current version information */
  currentVersion?: {
    id: string;
    name: string;
    version: number;
  };
  /** Current deployment step */
  currentStep?: DeploymentStep;
  /** Callback for resetting form to last saved state */
  onReset: () => void;
  /** Callback for creating new version */
  onNewVersion: () => void;
  /** Callback for saving current changes */
  onSave: () => void;
  /** Callback for deploying configuration */
  onDeploy: () => void;
  /** Callback for deleting current version */
  onDelete?: () => void;
  /** Connectivity check result for steps 1 & 3 */
  connectivityResult?: ConnectivityResult | null;
  /** Additional className for styling */
  className?: string;
}

export function DeploymentActionsPanel({
  selectedDeviceId,
  hasUnsavedChanges,
  isLoading,
  currentVersion,
  currentStep,
  onReset,
  onNewVersion,
  onSave,
  onDeploy,
  onDelete,
  connectivityResult,
  className,
}: DeploymentActionsPanelProps) {
  const { t } = useTranslation();

  // Button state logic
  const canReset = hasUnsavedChanges && !isLoading;
  const canSave = hasUnsavedChanges && !!selectedDeviceId && !isLoading;
  const canNewVersion = !!selectedDeviceId && !isLoading;
  const canDelete =
    !!currentVersion &&
    currentVersion.id !== "default" &&
    !isLoading &&
    onDelete;

  // Determine button text and icon based on current step
  // Button is enabled on all steps when a device is selected
  const isInstallStep = currentStep === "os-installation";
  const isBootingStep = currentStep === "booting-live";
  const isRebootingStep = currentStep === "rebooting";
  const canDeploy = !!selectedDeviceId && !isLoading;

  // Button text: "Check Online" for steps 1 & 3, "Install" for step 2, "Deploy" for step 4
  const getDeployButtonText = () => {
    if (isBootingStep || isRebootingStep) {
      return t("deployments.checkOnline");
    }
    if (isInstallStep) {
      return t("deployments.install");
    }
    return t("deployments.deploy");
  };

  // Button icon: wifi for steps 1 & 3, download for step 2, rocket for step 4
  const getDeployButtonIcon = () => {
    if (isBootingStep || isRebootingStep) {
      return faWifi;
    }
    if (isInstallStep) {
      return faDownload;
    }
    return faRocket;
  };

  const deployButtonText = getDeployButtonText();
  const deployButtonIcon = getDeployButtonIcon();

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "bg-background/95 supports-[backdrop-filter]:bg-background/60 backdrop-blur",
        "border-border border-t shadow-lg",
        className,
      )}
      data-slot="deployment-actions-panel"
    >
      <div className="container mx-auto px-4 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          {/* Left side - Reset and Delete buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="default"
              disabled={!canReset}
              onClick={onReset}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <FontAwesomeIcon
                  icon={faRotateLeft}
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              )}
              {t("buttons.reset")}
            </Button>

            {canDelete && (
              <Button
                type="button"
                variant="outline"
                size="default"
                disabled={!canDelete}
                onClick={onDelete}
                className="flex items-center gap-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                {isLoading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <FontAwesomeIcon
                    icon={faTrash}
                    className="h-4 w-4"
                    aria-hidden="true"
                  />
                )}
                {t("buttons.delete")}
              </Button>
            )}
          </div>

          {/* Middle section - Current version info (if available) */}
          {currentVersion && (
            <div className="text-muted-foreground hidden items-center gap-2 text-sm md:flex">
              <span>
                {t("deployments.currentVersion")}: {currentVersion.name} v
                {currentVersion.version}
              </span>
            </div>
          )}

          {/* Right side - Action buttons */}
          <div className="flex items-center gap-3">
            {/* New Version button */}
            <Button
              type="button"
              variant="outline"
              size="default"
              disabled={!canNewVersion}
              onClick={onNewVersion}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <FontAwesomeIcon
                  icon={faPlus}
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              )}
              {t("deployments.newVersion")}
            </Button>

            {/* Save button */}
            <Button
              type="button"
              variant="secondary"
              size="default"
              disabled={!canSave}
              onClick={onSave}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <FontAwesomeIcon
                  icon={faFloppyDisk}
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              )}
              {t("buttons.save")}
            </Button>

            {/* Deploy/Install button */}
            <Button
              type="button"
              variant="default"
              size="default"
              disabled={!canDeploy}
              onClick={onDeploy}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
            >
              {isLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <FontAwesomeIcon
                  icon={deployButtonIcon}
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              )}
              {deployButtonText}
            </Button>

            {/* Connectivity result indicator (only shown on steps 1 & 3) */}
            {(isBootingStep || isRebootingStep) && connectivityResult && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-help">
                    <FontAwesomeIcon
                      icon={connectivityResult.success ? faCircleCheck : faCircleXmark}
                      className={`h-6 w-6 ${connectivityResult.success ? "text-green-500" : "text-red-500"}`}
                      aria-hidden="true"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-popover text-popover-foreground">
                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="font-semibold">PING:</span>{" "}
                      <span className={connectivityResult.ping.success ? "text-green-500" : "text-red-500"}>
                        {connectivityResult.ping.success ? "OK" : "FAILED"}
                      </span>
                    </p>
                    <p>
                      <span className="font-semibold">ANSIBLE:</span>{" "}
                      <span className={connectivityResult.ansible.success ? "text-green-500" : "text-red-500"}>
                        {connectivityResult.ansible.success ? "OK" : "FAILED"}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      {t("deployments.steps.moreDetailsAt")}{" "}
                      <span className="font-mono font-semibold">
                        #{connectivityResult.executionId}
                      </span>
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
