import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import * as OTPAuth from "otpauth";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCopy,
  faCheck,
  faRotateRight,
  faDownload,
  faKey,
  faWifi,
  faCircleCheck,
  faCircleXmark,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

interface BootingLiveStepProps {
  deviceId?: string;
  deviceName?: string;
  networkId?: string;
  domainId?: string;
  totpCounter?: number;
  /** Shared connectivity check handler from parent */
  onCheckConnectivity?: () => void;
  /** Shared connectivity check loading state from parent */
  isCheckingConnectivity?: boolean;
  /** Shared connectivity result from parent */
  connectivityResult?: ConnectivityResult | null;
}

export function BootingLiveStep({
  deviceId,
  deviceName,
  networkId,
  domainId,
  totpCounter = 0,
  onCheckConnectivity,
  isCheckingConnectivity,
  connectivityResult: externalConnectivityResult,
}: BootingLiveStepProps) {
  const { t } = useTranslation();
  const [token, setToken] = useState<string>("");
  const [timeRemaining, setTimeRemaining] = useState<number>(600);
  const [copied, setCopied] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [currentCounter, setCurrentCounter] = useState<number>(totpCounter);
  // Use external connectivity result if provided, otherwise use local state
  const [localConnectivityResult, setLocalConnectivityResult] = useState<ConnectivityResult | null>(null);
  const connectivityResult = externalConnectivityResult !== undefined ? externalConnectivityResult : localConnectivityResult;
  const queryClient = useQueryClient();

  const incrementCounterMutation = useMutation({
    ...trpc.incrementTotpCounter.mutationOptions(),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: trpc.getDevices.queryKey(),
      });
      setCurrentCounter(data.totp_counter);
      setStartTime(Math.floor(Date.now() / 1000));
      toast.success(t("deployments.steps.totpRegenerated"));
    },
    onError: (error) => {
      toast.error(error.message || t("deployments.steps.totpRegenerateFailed"));
    },
  });

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

  // Sync currentCounter when totpCounter prop changes
  useEffect(() => {
    setCurrentCounter(totpCounter);
  }, [totpCounter]);

  // Auto-increment counter when timer expires
  useEffect(() => {
    if (
      timeRemaining === 0 &&
      deviceId &&
      !incrementCounterMutation.isPending
    ) {
      incrementCounterMutation.mutate({ id: deviceId });
    }
  }, [timeRemaining, deviceId, incrementCounterMutation.isPending]);

  useEffect(() => {
    if (!deviceId || !networkId || !domainId) return;

    const combinedSecret = `${domainId}-${networkId}-${deviceId}-${currentCounter}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(combinedSecret);
    const secret = new OTPAuth.Secret({ buffer: data });

    const initialStartTime = startTime || Math.floor(Date.now() / 1000);
    if (startTime === 0) {
      setStartTime(initialStartTime);
    }

    const totp = new OTPAuth.TOTP({
      issuer: "IoTGW",
      label: deviceName || "device",
      algorithm: "SHA1",
      digits: 6,
      period: 600,
      secret: secret,
    });

    const updateToken = () => {
      const currentToken = totp.generate({ timestamp: startTime * 1000 });
      setToken(currentToken);

      const now = Math.floor(Date.now() / 1000);
      const elapsed = now - startTime;
      const remaining = Math.max(0, 600 - elapsed);
      setTimeRemaining(remaining);
    };

    updateToken();
    const interval = setInterval(updateToken, 1000);

    return () => clearInterval(interval);
  }, [deviceId, networkId, domainId, deviceName, startTime, currentCounter]);

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(t("deployments.steps.copiedToClipboard", { label }));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("deployments.steps.copyFailed"));
    }
  };

  const handleReset = () => {
    if (deviceId) {
      incrementCounterMutation.mutate({ id: deviceId });
    }
  };

  // Calculate username: device_name@network_id[:8]
  const username = deviceName && networkId
    ? `${deviceName}@${networkId.slice(0, 8)}`
    : undefined;

  // Calculate progress percentage
  const progress = (timeRemaining / 600) * 100;

  if (!deviceId) {
    return (
      <div className="text-muted-foreground py-8 text-center">
        {t("deployments.steps.selectDeviceFirst")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step 1: Download USB image */}
      <div className="bg-gradient-to-br from-muted/50 to-muted/30 rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <span className="bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold">
            1
          </span>
          <p className="text-sm font-medium">
            {t("deployments.steps.instruction1")}
          </p>
        </div>
      </div>

      {/* Download button between step 1 and 2 */}
      <div className="pl-9">
        <Button variant="outline" size="sm" className="gap-2" asChild>
          <a
            href="/downloads/openwrt-live-usb.img.gz"
            download
            target="_blank"
            rel="noopener noreferrer"
          >
            <FontAwesomeIcon
              icon={faDownload}
              className="h-4 w-4"
              aria-hidden="true"
            />
            {t("deployments.steps.downloadUsbImage")}
          </a>
        </Button>
      </div>

      {/* Step 2: Write image to USB */}
      <div className="bg-gradient-to-br from-muted/50 to-muted/30 rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <span className="bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold">
            2
          </span>
          <p className="text-sm font-medium">
            {t("deployments.steps.instruction2")}
          </p>
        </div>
      </div>

      {/* Step 3: Boot and login */}
      <div className="bg-gradient-to-br from-muted/50 to-muted/30 rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <span className="bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold">
            3
          </span>
          <p className="text-sm font-medium">
            {t("deployments.steps.instruction3")}
          </p>
        </div>
      </div>

      {/* Device Credentials Section */}
      <div className="flex justify-center pt-2">
        <div className="w-[60%]">
          <h4 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <FontAwesomeIcon
              icon={faKey}
              className="text-primary h-5 w-5"
              aria-hidden="true"
            />
            {t("deployments.steps.credentials")}
          </h4>
          <div className="space-y-4">
            {/* Username */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t("deployments.steps.username")}
                </p>
                <p className="font-mono text-lg font-medium">{username || "---"}</p>
              </div>
              {username && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(username, "Username")}
                >
                  <FontAwesomeIcon
                    icon={copied ? faCheck : faCopy}
                    className="h-4 w-4"
                    aria-hidden="true"
                  />
                </Button>
              )}
            </div>

            {/* TOTP Password */}
            <div>
              <p className="text-muted-foreground mb-2 text-xs uppercase tracking-wide">
                {t("deployments.steps.password")}
              </p>
              <div className="flex items-center gap-3">
                <div className="bg-muted rounded-lg px-4 py-2 font-mono text-2xl font-bold tracking-wider">
                  {token ? (
                    <>
                      <span>{token.slice(0, 3)}</span>
                      <span className="text-muted-foreground mx-1">-</span>
                      <span>{token.slice(3, 6)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">------</span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(token, "Password")}
                  disabled={!token}
                >
                  <FontAwesomeIcon
                    icon={copied ? faCheck : faCopy}
                    className="h-4 w-4"
                    aria-hidden="true"
                  />
                </Button>
              </div>

              {/* Timer Progress Bar */}
              <div className="mt-3">
                <div className="bg-muted mb-1 h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full transition-all duration-1000 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-xs">
                    {t("deployments.steps.refreshesIn", { seconds: timeRemaining })}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    disabled={incrementCounterMutation.isPending}
                    className="h-auto px-2 py-1"
                  >
                    <FontAwesomeIcon
                      icon={faRotateRight}
                      className="mr-1 h-3 w-3"
                      aria-hidden="true"
                    />
                    <span className="text-xs">
                      {t("deployments.steps.regenerate")}
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <p className="text-muted-foreground mt-3 text-xs">
            {t("deployments.steps.totpNote")}
          </p>
        </div>
      </div>

      {/* Ensure Connectivity Section */}
      <div className="flex justify-center pt-2">
        <div className="w-[60%]">
          <h4 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <FontAwesomeIcon
              icon={faWifi}
              className="text-primary h-5 w-5"
              aria-hidden="true"
            />
            {t("deployments.steps.ensureConnectivity")}
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
              {t("deployments.steps.checkOnline")}
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
