import { useState } from "react";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  formatConfigPath,
  getIn,
  parseConfig,
  validateDeploymentConfigStep,
} from "@/lib/deployment-config-form";
import type {
  DeploymentDevice,
  DeploymentDraft,
  DeploymentVersion,
} from "@/lib/deployment-workspace";

export function DeploymentReviewDialog({
  open,
  onOpenChange,
  device,
  draft,
  version,
  isInstall,
  needsSave,
  isBusy,
  onConfirm,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: DeploymentDevice;
  draft: DeploymentDraft;
  version?: DeploymentVersion;
  isInstall: boolean;
  needsSave: boolean;
  isBusy: boolean;
  onConfirm: () => void;
  onClosed: () => void;
}) {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);
  const config = parseConfig(draft.configurationJson);
  const issues = config
    ? validateDeploymentConfigStep(
        config,
        isInstall ? "os-installation" : "provisioning",
      )
    : [];
  const diskValue = getIn(config, ["osInstallation", "target_disk"]);
  const osValue = getIn(config, ["osInstallation", "openwrt_version"]);
  const disk = typeof diskValue === "string" ? diskValue : "—";
  const os = typeof osValue === "string" ? osValue : "—";
  const problems = [
    ...(!device.ip_address ? [t("deployments.workspace.missingIp")] : []),
    ...(!device.ssh_key_id ? [t("deployments.workspace.missingKey")] : []),
    ...(!draft.name.trim() ? [t("deployments.workspace.nameRequired")] : []),
    ...(!config ? [t("deployments.workspace.invalidJson")] : []),
    ...issues.map(
      (issue) => `${formatConfigPath(issue.path)}: ${issue.message}`,
    ),
  ];
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!isBusy) {
          setAcknowledged(false);
          onOpenChange(value);
        }
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={() => {
          setAcknowledged(false);
          requestAnimationFrame(onClosed);
        }}
        onEscapeKeyDown={(event) => {
          if (isBusy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isBusy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {t(
              isInstall
                ? "deployments.workspace.reviewInstall"
                : "deployments.workspace.reviewProvision",
            )}
          </DialogTitle>
          <DialogDescription>
            {t("deployments.workspace.reviewHelp")}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 rounded-lg border p-4 text-sm">
          <dt className="text-muted-foreground">
            {t("deployments.workspace.targetDevice")}
          </dt>
          <dd className="text-right font-semibold break-words">
            {device.name}
            <span className="text-muted-foreground block font-mono text-xs font-normal">
              {device.ip_address ?? "—"}
            </span>
          </dd>
          <dt className="text-muted-foreground">
            {t("deployments.workspace.configuration")}
          </dt>
          <dd className="text-right break-words">
            {draft.name || "—"}
            <span className="text-muted-foreground block text-xs">
              {version
                ? `v${version.version}`
                : t("deployments.workspace.newDraft")}
            </span>
          </dd>
          {isInstall && (
            <>
              <dt className="text-muted-foreground">OpenWrt</dt>
              <dd className="text-right font-mono">{os}</dd>
              <dt className="text-muted-foreground">
                {t("deployments.workspace.targetDisk")}
              </dt>
              <dd className="text-right font-mono font-semibold">{disk}</dd>
            </>
          )}
        </dl>
        {needsSave && (
          <p className="bg-muted rounded-lg p-3 text-sm">
            {t("deployments.workspace.saveBeforeRun")}
          </p>
        )}
        {problems.length > 0 && (
          <div
            role="alert"
            className="border-destructive/40 bg-destructive/5 rounded-lg border p-4"
          >
            <p className="text-sm font-semibold">
              {t("deployments.workspace.resolveBeforeRun")}
            </p>
            <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-4 text-xs break-words">
              {problems.map((problem, index) => (
                <li key={index}>{problem}</li>
              ))}
            </ul>
          </div>
        )}
        {isInstall ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="size-4 shrink-0" />
              {t("deployments.workspace.diskWarning")}
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              {t("deployments.workspace.diskWarningHelp", {
                disk,
                device: device.name,
              })}
            </p>
            <div className="mt-4 flex items-start gap-3">
              <Checkbox
                id="acknowledge-install"
                checked={acknowledged}
                onCheckedChange={(value) => setAcknowledged(value === true)}
                disabled={isBusy}
              />
              <Label
                htmlFor="acknowledge-install"
                className="text-sm leading-relaxed"
              >
                {t("deployments.workspace.acknowledgeDisk", { disk })}
              </Label>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("deployments.workspace.provisionWarning")}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            disabled={isBusy}
            onClick={() => onOpenChange(false)}
          >
            {t("deployments.workspace.backToSetup")}
          </Button>
          <Button
            disabled={
              isBusy || problems.length > 0 || (isInstall && !acknowledged)
            }
            onClick={onConfirm}
          >
            {isBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowRight className="size-4" />
            )}
            {t(
              isBusy
                ? "deployments.workspace.starting"
                : isInstall
                  ? needsSave
                    ? "deployments.workspace.saveAndInstall"
                    : "deployments.workspace.installNow"
                  : needsSave
                    ? "deployments.workspace.saveAndProvision"
                    : "deployments.workspace.provisionNow",
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
