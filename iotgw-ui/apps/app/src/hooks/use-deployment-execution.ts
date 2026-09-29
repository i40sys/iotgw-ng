import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { trpc } from "@/utils/trpc";
import type { DeploymentVersion } from "@/lib/deployment-workspace";
import {
  draftFromVersion,
  prepareConfiguration,
} from "@/lib/deployment-workspace";

const statusSchema = z.object({
  status: z.enum(["PENDING", "RUNNING", "SUCCESS", "FAILED"]),
  startedAt: z.string().nullish(),
  completedAt: z.string().nullish(),
  message: z.string().nullish(),
});
const executionSchema = statusSchema.extend({
  executionId: z.string(),
  flowId: z.string(),
});
type Execution = z.infer<typeof executionSchema>;

export function useDeploymentExecution(deviceId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [execution, setExecution] = useState<Execution | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const notified = useRef<string | null>(null);
  const start = useMutation(trpc.executeKestraDeployment.mutationOptions());
  const statusQuery = useQuery({
    ...trpc.checkKestraExecutionStatus.queryOptions({
      execution_id: execution?.executionId ?? "",
      flow_id: execution?.flowId,
    }),
    enabled: !!execution,
    select: (data) => statusSchema.parse(data),
    // Monitoring belongs to the execution, not to whether its dialog is open.
    refetchInterval: (query) =>
      query.state.data?.status === "SUCCESS" ||
      query.state.data?.status === "FAILED"
        ? false
        : 1500,
  });
  const status = statusQuery.data?.status ?? execution?.status ?? "PENDING";
  const isRunning =
    !!execution && (status === "RUNNING" || status === "PENDING");
  useEffect(() => {
    if (
      !execution ||
      (status !== "SUCCESS" && status !== "FAILED") ||
      notified.current === execution.executionId
    )
      return;
    notified.current = execution.executionId;
    void queryClient.invalidateQueries({
      queryKey: trpc.listDeploymentJobs.queryKey(),
    });
    if (status === "SUCCESS")
      toast.success(t("deployments.workspace.executionSucceeded"));
    else toast.error(t("deployments.workspace.executionFailed"));
  }, [execution, status, queryClient, t]);

  async function run(
    version: DeploymentVersion,
    flowType: "install" | "provisioning",
  ) {
    if (version.device_id !== deviceId) return false;
    try {
      const result = await start.mutateAsync({
        device_id: deviceId,
        deployment_id: version.id,
        configuration: prepareConfiguration(
          draftFromVersion(version),
          version.version,
        ),
        flow_type: flowType,
      });
      setExecution(executionSchema.parse(result));
      void queryClient.invalidateQueries({
        queryKey: trpc.listDeploymentJobs.queryKey(),
      });
      return true;
    } catch {
      toast.error(t("deployments.workspace.startFailed"));
      return false;
    }
  }

  return {
    run,
    isRunning,
    isPending: start.isPending,
    isOpen,
    setIsOpen,
    execution,
    status,
    statusQuery,
  };
}
