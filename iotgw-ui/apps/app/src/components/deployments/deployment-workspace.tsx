import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  Activity,
  FileSliders,
  ListChecks,
  Loader2,
  Radio,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DeploymentStepTabs,
  DeploymentStepContent,
} from "@/components/deployment-step-tabs";
import { DEPLOYMENT_STEPS } from "@/lib/deployment-stages";
import type { DeploymentStep } from "@/lib/deployment-stages";
import { DeploymentJobsList } from "@/components/deployment-jobs-list";
import { DeploymentStatusDialog } from "@/components/deployment-status-dialog";
import { OsInstallationStep } from "@/components/deployment-steps/os-installation-step";
import { ProvisioningStep } from "@/components/deployment-steps/provisioning-step";
import { DeploymentConfigurationPanel } from "./configuration-panel";
import { DeploymentConnectivityStage } from "./connectivity-stage";
import { DeploymentReviewDialog } from "./review-dialog";
import { useDeploymentWorkspace } from "@/hooks/use-deployment-workspace";
import { useDeploymentExecution } from "@/hooks/use-deployment-execution";
import {
  parseConfig,
  validateDeploymentConfigStep,
} from "@/lib/deployment-config-form";
import type { DeploymentDevice } from "@/lib/deployment-workspace";
import { openPage } from "@/lib/open-page";
import { cn } from "@/lib/utils";

const stepDescription: Record<DeploymentStep, string> = {
  "booting-live": "deployments.workspace.bootHelp",
  "os-installation": "deployments.workspace.installHelp",
  rebooting: "deployments.workspace.rebootHelp",
  provisioning: "deployments.workspace.provisionHelp",
};

export function DeploymentWorkspace({
  device,
  initialStep,
}: {
  device: DeploymentDevice;
  initialStep?: DeploymentStep;
}) {
  const { t } = useTranslation();
  const workspace = useDeploymentWorkspace(device.id);
  const execution = useDeploymentExecution(device.id);
  const [activeStep, setActiveStep] = useState<DeploymentStep>(() => {
    if (initialStep) return initialStep;
    try {
      const remembered = sessionStorage.getItem(
        `iotgw-deployment-stage-v2:${device.id}`,
      );
      return (
        DEPLOYMENT_STEPS.find((step) => step.id === remembered)?.id ??
        "booting-live"
      );
    } catch {
      return "booting-live";
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(
        `iotgw-deployment-stage-v2:${device.id}`,
        activeStep,
      );
    } catch {
      /* Optional preference. */
    }
  }, [device.id, activeStep]);
  const [view, setView] = useState<"configuration" | "setup" | "activity">(
    "setup",
  );
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const starting = useRef(false);
  const shouldOpenProgress = useRef(false);
  const isBusy = workspace.isBusy || isStarting;
  const shouldBlockFn = useCallback(
    () => workspace.hasChanges || isBusy,
    [workspace.hasChanges, isBusy],
  );
  const blocker = useBlocker({
    shouldBlockFn,
    enableBeforeUnload: workspace.hasChanges || isBusy,
    withResolver: true,
  });
  const stepIndex = DEPLOYMENT_STEPS.findIndex(
    (step) => step.id === activeStep,
  );
  const isInstall = activeStep === "os-installation";
  const isConfigStep = isInstall || activeStep === "provisioning";
  const config = workspace.draft
    ? parseConfig(workspace.draft.configurationJson)
    : null;
  const issues =
    config && isConfigStep
      ? validateDeploymentConfigStep(
          config,
          isInstall ? "os-installation" : "provisioning",
        )
      : [];

  function changeVersion(id: string) {
    if (workspace.activeVersion?.id === id) return;
    if (workspace.hasChanges) setPendingVersion(id);
    else workspace.selectVersion(id);
  }
  function cancelNavigation() {
    setPendingVersion(null);
    blocker.reset?.();
  }
  function continueNavigation() {
    if (pendingVersion) {
      workspace.selectVersion(pendingVersion);
      setPendingVersion(null);
    } else blocker.proceed?.();
  }
  async function saveAndContinue() {
    if (await workspace.save()) continueNavigation();
  }
  function discardAndContinue() {
    workspace.discard();
    continueNavigation();
  }
  async function confirmExecution() {
    if (
      starting.current ||
      !workspace.draft ||
      !config ||
      issues.length ||
      !device.ip_address ||
      !device.ssh_key_id ||
      !workspace.draft.name.trim()
    )
      return;
    starting.current = true;
    setIsStarting(true);
    try {
      const version =
        workspace.hasChanges || !workspace.activeVersion
          ? await workspace.save()
          : workspace.activeVersion;
      if (
        version &&
        (await execution.run(version, isInstall ? "install" : "provisioning"))
      ) {
        shouldOpenProgress.current = true;
        setIsReviewOpen(false);
      }
    } finally {
      starting.current = false;
      setIsStarting(false);
    }
  }

  if (workspace.versionsQuery.isError)
    return (
      <div role="alert" className="bg-card space-y-3 rounded-xl border p-6">
        <p>{t("deployments.workspace.loadFailed")}</p>
        <Button
          variant="outline"
          onClick={() => {
            void workspace.versionsQuery.refetch();
          }}
        >
          {t("deployments.workspace.retry")}
        </Button>
      </div>
    );
  if (!workspace.draft)
    return (
      <div
        role="status"
        className="text-muted-foreground flex items-center gap-3 p-8"
      >
        <Loader2 className="size-4 animate-spin" />
        {t("deployments.workspace.loadingConfiguration")}
      </div>
    );
  const draft = workspace.draft;
  const configurationLabel = draft.name.trim()
    ? t("deployments.workspace.namedConfiguration", {
        name: draft.name.trim(),
      })
    : t("deployments.workspace.configuration");
  const updateJson = (configurationJson: string) =>
    workspace.setDraft({ ...draft, configurationJson });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="bg-muted inline-flex w-full min-w-0 flex-wrap gap-1 rounded-lg p-1 sm:w-auto sm:max-w-full"
          role="group"
          aria-label={t("deployments.workspace.workspaceView")}
        >
          <Button
            variant="ghost"
            size="sm"
            className="aria-pressed:bg-background aria-pressed:text-primary w-full min-w-0 cursor-pointer justify-start aria-pressed:shadow-sm sm:w-auto sm:max-w-sm"
            aria-pressed={view === "configuration"}
            title={configurationLabel}
            onClick={() => setView("configuration")}
          >
            <FileSliders className="size-4" />
            <span className="truncate">{configurationLabel}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="aria-pressed:bg-background aria-pressed:text-primary flex-1 cursor-pointer aria-pressed:shadow-sm sm:flex-none"
            aria-pressed={view === "setup"}
            onClick={() => setView("setup")}
          >
            <ListChecks className="size-4" />
            {t("deployments.workspace.setup")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="aria-pressed:bg-background aria-pressed:text-primary flex-1 cursor-pointer aria-pressed:shadow-sm sm:flex-none"
            aria-pressed={view === "activity"}
            onClick={() => setView("activity")}
          >
            <Activity className="size-4" />
            {t("deployments.workspace.deviceActivity")}
          </Button>
        </div>
        {execution.execution && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => execution.setIsOpen(true)}
          >
            {execution.isRunning && <Radio className="size-4 animate-pulse" />}
            {t(
              execution.isRunning
                ? "deployments.workspace.operationRunning"
                : "deployments.workspace.viewLastOperation",
            )}
          </Button>
        )}
      </div>
      {view === "configuration" ? (
        <DeploymentConfigurationPanel
          draft={draft}
          onChange={workspace.setDraft}
          version={workspace.activeVersion}
          versions={workspace.versions}
          hasChanges={workspace.hasChanges}
          isBusy={isBusy}
          isRestored={workspace.isRestored}
          onSelectVersion={changeVersion}
          onSave={() => {
            void workspace.save();
          }}
          onSaveNew={() => {
            void workspace.save(true);
          }}
          onDiscard={workspace.discard}
          onDelete={() => setIsDeleteOpen(true)}
        />
      ) : view === "activity" ? (
        <DeploymentJobsList
          deviceId={device.id}
          onViewLogs={(id) => openPage(`/deployments/debug/${id}`)}
        />
      ) : (
        <DeploymentStepTabs
          activeStep={activeStep}
          onStepChange={(step) => {
            if (!isBusy) setActiveStep(step);
          }}
        >
          <section
            className="bg-card min-w-0 rounded-xl border"
            aria-labelledby="deployment-stage-title"
          >
            <div className="space-y-2 border-b p-5 sm:p-6">
              <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                {t("deployments.workspace.stepOf", {
                  step: stepIndex + 1,
                  total: 4,
                })}
              </p>
              <h2
                id="deployment-stage-title"
                className="text-xl font-semibold tracking-tight"
              >
                {t(DEPLOYMENT_STEPS[stepIndex].labelKey)}
              </h2>
              <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
                {t(stepDescription[activeStep])}
              </p>
            </div>
            <fieldset disabled={isBusy} className="min-w-0 p-5 sm:p-6">
              <DeploymentStepContent step="booting-live">
                <DeploymentConnectivityStage
                  key="boot"
                  device={device}
                  isBoot
                />
              </DeploymentStepContent>
              <DeploymentStepContent step="os-installation">
                <OsInstallationStep
                  configurationJson={draft.configurationJson}
                  onConfigurationChange={updateJson}
                />
              </DeploymentStepContent>
              <DeploymentStepContent step="rebooting">
                <DeploymentConnectivityStage
                  key="reboot"
                  device={device}
                  isBoot={false}
                />
              </DeploymentStepContent>
              <DeploymentStepContent step="provisioning">
                <ProvisioningStep
                  configurationJson={draft.configurationJson}
                  onConfigurationChange={updateJson}
                  onLoadFromFile={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file)
                      void file
                        .text()
                        .then((text) => {
                          if (parseConfig(text)) {
                            workspace.setDraft((previous) =>
                              previous
                                ? { ...previous, configurationJson: text }
                                : previous,
                            );
                            toast.success(
                              t("deployments.workspace.fileLoaded"),
                            );
                          } else
                            toast.error(t("deployments.workspace.invalidJson"));
                        })
                        .catch(() =>
                          toast.error(t("deployments.workspace.fileFailed")),
                        );
                  }}
                />
              </DeploymentStepContent>
            </fieldset>
            <div className="space-y-3 border-t p-4 sm:px-6">
              {isConfigStep && (
                <p
                  className={cn(
                    "flex items-start gap-2 text-xs",
                    issues.length || !config
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-muted-foreground",
                  )}
                >
                  <TriangleAlert className="size-3.5 shrink-0" />
                  {!config
                    ? t("deployments.workspace.invalidJson")
                    : issues.length
                      ? t("deployments.workspace.fieldsNeedAttention", {
                          count: issues.length,
                        })
                      : t(
                          isInstall
                            ? "deployments.workspace.installReviewHint"
                            : "deployments.workspace.provisionReviewHint",
                        )}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  disabled={stepIndex === 0 || isBusy}
                  onClick={() =>
                    setActiveStep(DEPLOYMENT_STEPS[stepIndex - 1].id)
                  }
                >
                  <ArrowLeft className="size-4" />
                  {t("deployments.workspace.previous")}
                </Button>
                <div className="flex flex-wrap justify-end gap-2">
                  {stepIndex < 3 && (
                    <Button
                      variant="outline"
                      disabled={isBusy}
                      onClick={() =>
                        setActiveStep(DEPLOYMENT_STEPS[stepIndex + 1].id)
                      }
                    >
                      {t("deployments.workspace.nextStep")}
                      <ArrowRight className="size-4" />
                    </Button>
                  )}
                  {isConfigStep && (
                    <Button
                      disabled={isBusy || execution.isRunning}
                      onClick={() => setIsReviewOpen(true)}
                    >
                      {t(
                        isInstall
                          ? "deployments.workspace.reviewInstall"
                          : "deployments.workspace.reviewProvision",
                      )}
                      <ArrowRight className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </section>
          <p className="text-muted-foreground px-1 text-xs leading-relaxed">
            {t("deployments.workspace.freeNavigationHelp")}
          </p>
        </DeploymentStepTabs>
      )}
      {
        <DeploymentReviewDialog
          open={isReviewOpen}
          onOpenChange={setIsReviewOpen}
          onClosed={() => {
            if (shouldOpenProgress.current) {
              shouldOpenProgress.current = false;
              execution.setIsOpen(true);
            }
          }}
          device={device}
          draft={draft}
          version={workspace.activeVersion}
          isInstall={isInstall}
          needsSave={workspace.hasChanges || !workspace.activeVersion}
          isBusy={isBusy}
          onConfirm={() => {
            void confirmExecution();
          }}
        />
      }
      <AlertDialog
        open={!!pendingVersion || blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && !isBusy) cancelNavigation();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deployments.workspace.unsavedTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deployments.workspace.unsavedHelp")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={isBusy}
              onClick={cancelNavigation}
            >
              {t("deployments.workspace.keepEditing")}
            </Button>
            <Button
              variant="outline"
              disabled={isBusy}
              onClick={discardAndContinue}
            >
              {t("deployments.workspace.discardAndContinue")}
            </Button>
            <Button
              disabled={isBusy}
              onClick={() => {
                void saveAndContinue();
              }}
            >
              {t("deployments.workspace.saveAndContinue")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={isDeleteOpen}
        onOpenChange={(open) => {
          if (!isBusy) setIsDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deployments.workspace.deleteVersionTitle", {
                version: workspace.activeVersion?.version,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deployments.workspace.deleteVersionHelp")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={isBusy}
              onClick={() => setIsDeleteOpen(false)}
            >
              {t("buttons.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={isBusy}
              onClick={() => {
                void workspace.deleteVersion().then((deleted) => {
                  if (deleted) setIsDeleteOpen(false);
                });
              }}
            >
              {t("deployments.workspace.deleteVersion")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DeploymentStatusDialog
        open={execution.isOpen}
        onOpenChange={execution.setIsOpen}
        executionId={execution.execution?.executionId}
        flowId={execution.execution?.flowId}
        status={execution.status}
        startedAt={
          execution.statusQuery.data?.startedAt ??
          execution.execution?.startedAt ??
          undefined
        }
        completedAt={execution.statusQuery.data?.completedAt ?? undefined}
        message={
          execution.statusQuery.data?.message ??
          execution.execution?.message ??
          undefined
        }
        onViewDebug={() => {
          if (execution.execution)
            openPage(`/deployments/debug/${execution.execution.executionId}`);
        }}
      />
      {execution.isRunning && execution.statusQuery.isError && (
        <p role="alert" className="text-destructive text-sm">
          {t("deployments.workspace.statusUnavailable")}
        </p>
      )}
    </>
  );
}
