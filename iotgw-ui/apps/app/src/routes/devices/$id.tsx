import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ErrorDisplay } from "@/components/ui/error-display";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Wifi, Network, Key, KeyRound, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/devices/$id")({
  loader: async ({ context, params }) => {
    const { queryClient, trpc } = context;
    await queryClient.ensureQueryData(
      trpc.getDevice.queryOptions({ id: params.id }),
    );
    return {};
  },
  errorComponent: ({ error }) => (
    <ErrorDisplay
      error={error instanceof Error ? error : new Error("Unknown error")}
    />
  ),
  pendingComponent: () => <LoadingSpinner />,
  component: DeviceDetailsPage,
});

function DeviceDetailsPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const deviceQuery = useQuery(trpc.getDevice.queryOptions({ id }));
  const generateSshKeyMutation = useMutation({
    ...trpc.generateMissingSshKey.mutationOptions(),
    onSuccess: (data) => {
      if (data.status === "exists") {
        toast.info(t("devices.sshKey.alreadyConfigured"));
      } else {
        toast.success(t("devices.sshKey.generateSuccess"));
      }
      void queryClient.invalidateQueries({
        queryKey: trpc.getDevice.queryKey({ id }),
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.getDevices.queryKey(),
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t("devices.sshKey.generateError"),
      );
    },
  });

  const device = deviceQuery.data;

  if (!device) {
    return (
      <div className="p-4">
        <p className="text-gray-500">Device not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Device: {device.name}</h1>
        <Badge variant="outline" className="font-mono">
          {device.id}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5" />
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-muted-foreground text-sm">Name</p>
              <p className="font-medium">{device.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Description</p>
              <p className="font-medium">
                {device.description ?? "No description"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Created</p>
              <p className="font-medium">
                {new Date(device.created_at).toLocaleString()}
              </p>
            </div>
            {device.updated_at && (
              <div>
                <p className="text-muted-foreground text-sm">Last Updated</p>
                <p className="font-medium">
                  {new Date(device.updated_at).toLocaleString()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              Network Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-muted-foreground text-sm">IP Address</p>
              <Badge variant="secondary" className="font-mono">
                {device.ip_address}
              </Badge>
            </div>
            {device.network && (
              <div>
                <p className="text-muted-foreground text-sm">Network</p>
                <p className="font-medium">{device.network.name}</p>
                {device.network.ipv4_cidr && (
                  <Badge variant="outline" className="mt-1 font-mono">
                    IPv4: {device.network.ipv4_cidr}
                  </Badge>
                )}
                {device.network.ipv6_cidr && (
                  <Badge variant="outline" className="ml-2 mt-1 font-mono">
                    IPv6: {device.network.ipv6_cidr}
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Security Keys
            </CardTitle>
            <CardDescription>
              Cryptographic keys for secure communication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-muted-foreground mb-2 text-sm">Public Key</p>
              {device.public_key ? (
                <pre className="bg-muted overflow-x-auto rounded-lg p-3 font-mono text-xs">
                  {device.public_key}
                </pre>
              ) : (
                <p className="text-gray-500">No public key configured</p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground mb-2 text-sm">Private Key</p>
              {device.private_key ? (
                <Badge variant="secondary">
                  Private key is stored securely (encrypted)
                </Badge>
              ) : (
                <p className="text-gray-500">No private key configured</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              {t("devices.sshKey.sectionTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {device.ssh_key_id ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  <span>{t("devices.sshKey.configured")}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">{t("devices.sshKey.keyId")}:</span>{" "}
                  <code className="bg-muted rounded px-1 py-0.5 font-mono">
                    {device.ssh_key_id}
                  </code>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4" />
                  <span>{t("devices.sshKey.notConfigured")}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("devices.sshKey.willBeGenerated")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={generateSshKeyMutation.isPending}
                  onClick={() =>
                    generateSshKeyMutation.mutate({ device_id: device.id })
                  }
                >
                  {generateSshKeyMutation.isPending
                    ? t("devices.sshKey.generating")
                    : t("devices.sshKey.generate")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
