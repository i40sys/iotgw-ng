import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";

/**
 * The device one-time code (decision-033), fetched from the backend — the
 * browser never derives codes. The backend returns the current 10-minute step's
 * code, or the next step's code (`next`) once the current one was already used.
 */

/** Longest acceptance window of a code: its own step plus the +1 step. */
export const CODE_MAX_VALIDITY_SECONDS = 2 * 600;

// Re-read periodically so a code consumed by a gateway (or a new step) shows up
// without the operator reopening the dialog.
const REFETCH_INTERVAL_MS = 30_000;

export function useDeviceCode(deviceId: string | undefined, isEnabled = true) {
  const queryClient = useQueryClient();
  const isActive = Boolean(deviceId) && isEnabled;
  const input = { id: deviceId ?? "" };

  const query = useQuery({
    ...trpc.getDeviceCode.queryOptions(input),
    enabled: isActive,
    refetchInterval: isActive ? REFETCH_INTERVAL_MS : false,
    refetchOnWindowFocus: isActive,
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  const validUntilMs = query.data ? Date.parse(query.data.validUntil) : NaN;
  const secondsLeft = Number.isFinite(validUntilMs)
    ? Math.max(0, Math.floor((validUntilMs - nowMs) / 1000))
    : 0;

  // An expired code is useless; fetch the current one straight away — once per
  // code, so a skewed browser clock cannot turn this into a request loop.
  const { refetch } = query;
  const isExpired = Boolean(query.data) && secondsLeft === 0;
  const refetchedFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    const validUntil = query.data?.validUntil;
    if (!isActive || !isExpired || refetchedFor.current === validUntil) return;
    refetchedFor.current = validUntil;
    void refetch();
  }, [isActive, isExpired, query.data?.validUntil, refetch]);

  const rotate = useMutation({
    ...trpc.rotateDeviceCode.mutationOptions(),
    onSuccess: (data) => {
      queryClient.setQueryData(trpc.getDeviceCode.queryKey(input), data);
      toast.success("Code reset — every earlier code for this device is now invalid");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to reset the code");
    },
  });

  return {
    code: query.data?.code ?? "",
    isNext: query.data?.next ?? false,
    validUntil: query.data?.validUntil,
    secondsLeft,
    progress: Math.min(100, (secondsLeft / CODE_MAX_VALIDITY_SECONDS) * 100),
    isLoading: query.isLoading,
    error: query.error,
    reset: () => {
      if (deviceId) rotate.mutate({ id: deviceId });
    },
    isResetting: rotate.isPending,
  };
}
