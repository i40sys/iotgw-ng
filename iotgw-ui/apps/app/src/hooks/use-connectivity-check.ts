import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { trpc } from "@/utils/trpc";

/** Poll interval while a check runs — fast enough to follow its phases. */
const POLL_MS = 1500;

export interface ConnectivityCheckResult {
  success: boolean;
  executionId?: string;
  ping: { success: boolean; error?: string; rawOutput: string; latency?: number };
  ansible: { success: boolean; error?: string; rawOutput: string };
}

/**
 * Runs a device connectivity check as start + progress (decision-030): the
 * backend starts the Kestra execution and returns at once; this hook then
 * polls its phase timeline so the UI can show what is being waited for.
 */
export function useConnectivityCheck() {
  const { t } = useTranslation();
  const [executionId, setExecutionId] = useState<string | null>(null);
  const notified = useRef<string | null>(null);

  const start = useMutation({
    ...trpc.startDeviceConnectivityCheck.mutationOptions(),
    onSuccess: (data) => setExecutionId(data.executionId),
    onError: (error) => {
      toast.error(error.message || t("deployments.steps.connectivityError"));
    },
  });

  const progressQuery = useQuery({
    ...trpc.getDeviceConnectivityCheck.queryOptions({ executionId: executionId ?? "" }),
    enabled: executionId !== null,
    refetchInterval: (query) => (query.state.data?.finished ? false : POLL_MS),
  });
  const progress = executionId ? progressQuery.data : undefined;

  const result = useMemo<ConnectivityCheckResult | null>(
    () =>
      progress?.finished && progress.ping && progress.ansible
        ? {
            success: progress.success ?? false,
            executionId: progress.executionId,
            ping: progress.ping,
            ansible: progress.ansible,
          }
        : null,
    [progress],
  );

  useEffect(() => {
    if (result && notified.current !== result.executionId) {
      notified.current = result.executionId ?? null;
      if (result.success) toast.success(t("deployments.steps.connectivitySuccess"));
      else toast.error(t("deployments.steps.connectivityFailed"));
    }
  }, [result, t]);

  return {
    /** Start a new check for the device (clears the previous one). */
    run: (deviceId: string) => {
      setExecutionId(null);
      start.mutate({ deviceId });
    },
    isChecking: start.isPending || (executionId !== null && !progress?.finished),
    progress: progress ?? null,
    result,
    reset: () => setExecutionId(null),
  };
}
