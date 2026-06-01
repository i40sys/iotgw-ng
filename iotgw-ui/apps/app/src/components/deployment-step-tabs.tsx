import * as React from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlug,
  faDownload,
  faRotate,
  faGears,
} from "@fortawesome/free-solid-svg-icons";

export type DeploymentStep =
  | "booting-live"
  | "os-installation"
  | "rebooting"
  | "provisioning";

interface DeploymentStepTabsProps {
  activeStep: DeploymentStep;
  onStepChange: (step: DeploymentStep) => void;
  className?: string;
  children?: React.ReactNode;
}

const DEPLOYMENT_STEPS = [
  {
    id: "booting-live" as const,
    labelKey: "deployments.steps.bootingLive",
    icon: faPlug,
  },
  {
    id: "os-installation" as const,
    labelKey: "deployments.steps.osInstallation",
    icon: faDownload,
  },
  {
    id: "rebooting" as const,
    labelKey: "deployments.steps.rebooting",
    icon: faRotate,
  },
  {
    id: "provisioning" as const,
    labelKey: "deployments.steps.provisioning",
    icon: faGears,
  },
] as const;

export function DeploymentStepTabs({
  activeStep,
  onStepChange,
  className,
  children,
}: DeploymentStepTabsProps) {
  const { t } = useTranslation();

  return (
    <Tabs
      value={activeStep}
      onValueChange={(value) => onStepChange(value as DeploymentStep)}
      className={cn("w-full", className)}
    >
      <TabsList className="grid w-full grid-cols-4 h-auto">
        {DEPLOYMENT_STEPS.map((step, index) => (
          <TabsTrigger
            key={step.id}
            value={step.id}
            className={cn(
              "flex flex-col gap-1 py-2 px-2 text-xs sm:text-sm",
              "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            )}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold data-[state=active]:bg-primary-foreground data-[state=active]:text-primary">
                {index + 1}
              </span>
              <FontAwesomeIcon icon={step.icon} className="h-4 w-4" />
            </div>
            <span className="hidden sm:inline truncate">
              {t(step.labelKey, step.id.replace("-", " "))}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}

export function DeploymentStepContent({
  step,
  children,
  className,
}: {
  step: DeploymentStep;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsContent value={step} className={cn("mt-4", className)}>
      {children}
    </TabsContent>
  );
}

export { DEPLOYMENT_STEPS };
