import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
  ArrowRight,
  ChevronRight,
  History,
  Loader2,
  Server,
  SlidersHorizontal,
} from "lucide-react";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { ErrorDisplay } from "@/components/ui/error-display";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DeploymentDevicePicker } from "@/components/deployments/device-picker";
import { DeploymentWorkspace } from "@/components/deployments/deployment-workspace";
import { DEPLOYMENT_STEPS } from "@/lib/deployment-stages";

const deploymentsSearchSchema = z.object({
  deviceId: z.string().optional(),
  networkId: z.string().optional(),
  domainId: z.string().optional(),
  step: z
    .enum(["booting-live", "os-installation", "rebooting", "provisioning"])
    .optional(),
});
export const Route = createFileRoute("/deployments/")({
  errorComponent: ({ error }) => <ErrorDisplay error={error} />,
  pendingComponent: () => <LoadingSpinner />,
  validateSearch: deploymentsSearchSchema,
  component: DeploymentsPage,
});
function rememberedDevice(): string | undefined {
  try {
    const current = localStorage.getItem("iotgw-deployment-target-v2");
    if (current) return current;
    const legacy: unknown = JSON.parse(
      localStorage.getItem("iotgw-deployment-settings") ?? "null",
    );
    if (
      legacy &&
      typeof legacy === "object" &&
      "selectedDeviceId" in legacy &&
      typeof legacy.selectedDeviceId === "string"
    )
      return legacy.selectedDeviceId;
  } catch {
    /* URL selection still works when storage is unavailable. */
  }
}
function DeploymentsPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [remembered] = useState(rememberedDevice);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  // Filters belong to the picker. They never hide or change the active target.
  const devicesQuery = useQuery(trpc.getDevicesFiltered.queryOptions({}));
  const networksQuery = useQuery(trpc.getNetworks.queryOptions());
  const domainsQuery = useQuery(trpc.getDomains.queryOptions());
  const deviceId =
    search.deviceId ??
    (search.domainId || search.networkId ? undefined : remembered);
  const device = devicesQuery.data?.find((item) => item.id === deviceId);
  const network = networksQuery.data?.find(
    (item) => item.id === device?.network_id,
  );
  const domain = domainsQuery.data?.find(
    (item) => item.id === network?.domain_id,
  );
  const isLoading =
    devicesQuery.isPending || networksQuery.isPending || domainsQuery.isPending;
  const error = devicesQuery.error ?? networksQuery.error ?? domainsQuery.error;
  useEffect(() => {
    if (device) {
      try {
        localStorage.setItem("iotgw-deployment-target-v2", device.id);
      } catch {
        /* Optional preference. */
      }
    }
  }, [device]);
  return (
    <div
      className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 pb-20 sm:px-6 lg:px-10"
      data-slot="deployments-workspace"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-widest uppercase">
            {t("deployments.workspace.eyebrow")}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("deployments.workspace.title")}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            {t("deployments.workspace.subtitle")}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/deployments/jobs">
            <History className="size-4" />
            {t("deployments.workspace.allJobs")}
          </Link>
        </Button>
      </header>
      {error ? (
        <div role="alert" className="space-y-3 rounded-xl border p-6">
          <p>{t("deployments.workspace.inventoryFailed")}</p>
          <Button
            variant="outline"
            onClick={() => {
              void devicesQuery.refetch();
              void networksQuery.refetch();
              void domainsQuery.refetch();
            }}
          >
            {t("deployments.workspace.retry")}
          </Button>
        </div>
      ) : isLoading ? (
        <div
          role="status"
          className="text-muted-foreground flex items-center gap-3 p-8"
        >
          <Loader2 className="size-4 animate-spin" />
          {t("deployments.workspace.loadingDevices")}
        </div>
      ) : device ? (
        <>
          <section
            className="bg-card grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-xl border px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
            aria-label={t("deployments.workspace.targetDevice")}
          >
            <div className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
              <Server className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground mb-1 text-xs">
                {t("deployments.workspace.targetDevice")}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold break-words">
                  {device.name}
                </h2>
                <span className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 font-mono text-xs">
                  {device.ip_address ?? t("deployments.workspace.noIp")}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1 text-xs">
                <span>{domain?.display_name ?? domain?.name ?? "—"}</span>
                <ChevronRight className="size-3" />
                <span>{network?.name ?? "—"}</span>
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="col-span-2 sm:col-span-1"
              onClick={() => setIsPickerOpen(true)}
            >
              <SlidersHorizontal className="size-3.5" />
              {t("deployments.workspace.changeDevice")}
            </Button>
          </section>
          <DeploymentWorkspace
            key={device.id}
            device={device}
            initialStep={search.step}
          />
        </>
      ) : (
        <>
          {deviceId && (
            <p
              role="alert"
              className="text-sm text-amber-700 dark:text-amber-300"
            >
              {t("deployments.workspace.deviceUnavailable")}
            </p>
          )}
          <section className="bg-card rounded-xl border px-6 py-12 sm:px-12">
            <div className="max-w-2xl">
              <div className="bg-primary/10 text-primary mb-5 flex size-12 items-center justify-center rounded-xl">
                <Server className="size-6" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {t("deployments.workspace.startTitle")}
              </h2>
              <p className="text-muted-foreground mt-3 max-w-xl text-sm leading-relaxed">
                {t("deployments.workspace.startHelp")}
              </p>
              <Button className="mt-6" onClick={() => setIsPickerOpen(true)}>
                {t("deployments.workspace.chooseDevice")}
                <ArrowRight className="size-4" />
              </Button>
            </div>
            <ol className="mt-10 grid gap-6 border-t pt-8 sm:grid-cols-2 lg:grid-cols-4">
              {DEPLOYMENT_STEPS.map((step, index) => (
                <li key={step.id}>
                  <span className="text-primary font-mono text-xs">
                    0{index + 1}
                  </span>
                  <h3 className="mt-2 text-sm font-semibold">
                    {t(step.labelKey)}
                  </h3>
                  <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                    {t(`deployments.workspace.stagePreview${index + 1}`)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
          <p className="text-muted-foreground text-center text-xs">
            {t("deployments.workspace.existingGatewayHelp")}
          </p>
        </>
      )}
      <DeploymentDevicePicker
        open={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        devices={devicesQuery.data ?? []}
        networks={networksQuery.data ?? []}
        domains={domainsQuery.data ?? []}
        initialDomainId={search.domainId}
        initialNetworkId={search.networkId}
        onSelect={(selected) => {
          void navigate({ search: { deviceId: selected.id }, replace: true });
        }}
      />
    </div>
  );
}
