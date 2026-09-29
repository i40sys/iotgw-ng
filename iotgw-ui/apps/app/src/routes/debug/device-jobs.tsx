import { createFileRoute } from "@tanstack/react-router";
import { DeviceJobsList } from "@/components/device-jobs-list";
import { useTranslation } from "react-i18next";
import { z } from "zod";

const deviceJobsSearchSchema = z.object({
  deviceName: z.string().optional(),
});

export const Route = createFileRoute("/debug/device-jobs")({
  component: DeviceJobsPage,
  validateSearch: deviceJobsSearchSchema,
});

function DeviceJobsPage() {
  const { deviceName } = Route.useSearch();
  const { t } = useTranslation();

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-5 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("deviceJobs.title")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("deviceJobs.pageDescription")}
        </p>
      </div>
      <DeviceJobsList showHeader={false} initialDeviceFilter={deviceName} />
    </div>
  );
}
