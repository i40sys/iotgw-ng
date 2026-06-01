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

  return (
    <div className="container mx-auto p-6">
      <DeviceJobsList showHeader={false} initialDeviceFilter={deviceName} />
    </div>
  );
}
