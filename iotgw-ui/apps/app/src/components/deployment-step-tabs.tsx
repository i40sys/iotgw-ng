import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { DEPLOYMENT_STEPS } from "@/lib/deployment-stages";
import type { DeploymentStep } from "@/lib/deployment-stages";

export function DeploymentStepTabs({
  activeStep,
  onStepChange,
  className,
  children,
}: {
  activeStep: DeploymentStep;
  onStepChange: (step: DeploymentStep) => void;
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Tabs
      value={activeStep}
      onValueChange={(value) => onStepChange(value as DeploymentStep)}
      className={cn("flex min-w-0 flex-col gap-5", className)}
    >
      <TabsList
        aria-label={t("deployments.workspace.stages")}
        className="bg-card grid h-auto w-full grid-cols-2 gap-1 rounded-xl border p-1.5 md:grid-cols-4"
      >
        {DEPLOYMENT_STEPS.map((step, index) => (
          <TabsTrigger
            key={step.id}
            value={step.id}
            className="group data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-auto min-w-0 justify-start gap-2.5 rounded-lg px-3 py-3 text-left whitespace-normal data-[state=active]:shadow-none"
          >
            <span className="bg-muted text-muted-foreground group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
              {index + 1}
            </span>
            <span className="text-xs font-semibold sm:text-sm">
              {t(step.labelKey)}
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
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsContent value={step} className={cn("min-w-0", className)}>
      {children}
    </TabsContent>
  );
}
