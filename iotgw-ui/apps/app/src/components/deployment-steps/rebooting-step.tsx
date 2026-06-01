import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faCircleXmark,
  faSpinner,
  faWifi,
} from "@fortawesome/free-solid-svg-icons";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
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

interface RebootingStepProps {
  deviceId?: string;
  /** Shared connectivity check handler from parent */
  onCheckConnectivity?: () => void;
  /** Shared connectivity check loading state from parent */
  isCheckingConnectivity?: boolean;
  /** Shared connectivity result from parent */
  connectivityResult?: ConnectivityResult | null;
}

export function RebootingStep({
  deviceId,
  onCheckConnectivity,
  isCheckingConnectivity,
  connectivityResult: externalConnectivityResult,
}: RebootingStepProps) {
  const { t } = useTranslation();
  // Use external connectivity result if provided, otherwise use local state
  const [localConnectivityResult, setLocalConnectivityResult] = useState<ConnectivityResult | null>(null);
  const connectivityResult = externalConnectivityResult !== undefined ? externalConnectivityResult : localConnectivityResult;

  // Local connectivity check mutation (used when no external handler is provided)
  const localConnectivityCheckMutation = useMutation({
    ...trpc.checkDeviceConnectivity.mutationOptions(),
    onSuccess: (data) => {
      setLocalConnectivityResult(data);
      if (data.success) {
        toast.success(t("deployments.steps.connectivitySuccess"));
      } else {
        toast.error(t("deployments.steps.connectivityFailed"));
      }
    },
    onError: (error) => {
      setLocalConnectivityResult(null);
      toast.error(error.message || t("deployments.steps.connectivityError"));
    },
  });

  // Use external handler if provided, otherwise use local mutation
  const handleCheckConnectivity = () => {
    if (onCheckConnectivity) {
      onCheckConnectivity();
    } else if (deviceId) {
      setLocalConnectivityResult(null);
      localConnectivityCheckMutation.mutate({ deviceId });
    }
  };

  // Determine if checking connectivity (external or local)
  const isPending = isCheckingConnectivity ?? localConnectivityCheckMutation.isPending;

  if (!deviceId) {
    return (
      <div className="text-muted-foreground py-8 text-center">
        {t("deployments.steps.selectDeviceFirst")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step 1: Remove USB */}
      <div className="bg-gradient-to-br from-muted/50 to-muted/30 rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <span className="bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold">
            1
          </span>
          <p className="text-sm font-medium">
            {t("deployments.steps.rebootInstruction1")}
          </p>
        </div>
      </div>

      {/* Step 2: Boot from disk */}
      <div className="bg-gradient-to-br from-muted/50 to-muted/30 rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <span className="bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold">
            2
          </span>
          <p className="text-sm font-medium">
            {t("deployments.steps.rebootInstruction2")}
          </p>
        </div>
      </div>

      {/* Step 3: Wait for device to come online */}
      <div className="bg-gradient-to-br from-muted/50 to-muted/30 rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <span className="bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold">
            3
          </span>
          <p className="text-sm font-medium">
            {t("deployments.steps.rebootInstruction3")}
          </p>
        </div>
      </div>

      {/* Check System Online Section */}
      <div className="flex justify-center pt-4">
        <div className="w-[60%]">
          <h4 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <FontAwesomeIcon
              icon={faWifi}
              className="text-primary h-5 w-5"
              aria-hidden="true"
            />
            {t("deployments.steps.checkSystemOnline")}
          </h4>

          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={handleCheckConnectivity}
              disabled={isPending}
              className="gap-2"
            >
              {isPending ? (
                <FontAwesomeIcon
                  icon={faSpinner}
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <FontAwesomeIcon
                  icon={faWifi}
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              )}
              {t("deployments.steps.checkSystemOnlineButton")}
            </Button>

            {/* Status indicator with tooltip */}
            {connectivityResult && (
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
                <TooltipContent side="right" className="bg-popover text-popover-foreground">
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

            {isPending && (
              <p className="text-muted-foreground text-sm">
                {t("deployments.steps.checkingConnectivity")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
