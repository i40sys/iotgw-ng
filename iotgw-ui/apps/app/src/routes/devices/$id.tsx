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
import {
  Wifi,
  Network,
  Key,
  KeyRound,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
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

  const sshCertQuery = useQuery(trpc.getSshCertStatus.queryOptions({ id }));
  const enrollSshCaMutation = useMutation({
    ...trpc.enrollSshCa.mutationOptions(),
    onSuccess: () => {
      toast.success(t("devices.sshCert.reenrollQueued"));
      void queryClient.invalidateQueries({
        queryKey: trpc.getSshCertStatus.queryKey({ id }),
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t("devices.sshCert.reenrollError"),
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

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              {t("devices.sshCert.sectionTitle")}
            </CardTitle>
            <CardDescription>{t("devices.sshCert.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {sshCertQuery.data?.enrolled ? (
              <div className="space-y-2">
                <div
                  className={
                    sshCertQuery.data.isExpired
                      ? "flex items-center gap-2 text-red-600 dark:text-red-400"
                      : "flex items-center gap-2 text-green-600 dark:text-green-400"
                  }
                >
                  {sshCertQuery.data.isExpired ? (
                    <ShieldAlert className="h-4 w-4" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  <span>
                    {sshCertQuery.data.isExpired
                      ? t("devices.sshCert.expired")
                      : t("devices.sshCert.enrolled")}
                  </span>
                  {sshCertQuery.data.expiresInDays !== null && (
                    <Badge
                      variant={
                        sshCertQuery.data.isExpired ? "destructive" : "secondary"
                      }
                    >
                      {sshCertQuery.data.isExpired
                        ? t("devices.sshCert.expiredDaysAgo", {
                            days: Math.abs(sshCertQuery.data.expiresInDays),
                          })
                        : t("devices.sshCert.expiresInDays", {
                            days: sshCertQuery.data.expiresInDays,
                          })}
                    </Badge>
                  )}
                </div>
                <dl className="grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>
                    <span className="font-medium">
                      {t("devices.sshCert.fqdn")}:
                    </span>{" "}
                    <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                      {sshCertQuery.data.fqdn}
                    </code>
                  </div>
                  <div>
                    <span className="font-medium">
                      {t("devices.sshCert.fingerprint")}:
                    </span>{" "}
                    <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                      {sshCertQuery.data.keyFingerprint}
                    </code>
                  </div>
                  <div>
                    <span className="font-medium">
                      {t("devices.sshCert.serial")}:
                    </span>{" "}
                    <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                      {sshCertQuery.data.certSerial}
                    </code>
                  </div>
                  {sshCertQuery.data.certValidBefore && (
                    <div>
                      <span className="font-medium">
                        {t("devices.sshCert.validBefore")}:
                      </span>{" "}
                      {new Date(
                        sshCertQuery.data.certValidBefore,
                      ).toLocaleString()}
                    </div>
                  )}
                </dl>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-4 w-4" />
                <span>{t("devices.sshCert.notEnrolled")}</span>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={enrollSshCaMutation.isPending}
              onClick={() => enrollSshCaMutation.mutate({ id: device.id })}
            >
              <RefreshCw className="h-4 w-4" />
              {enrollSshCaMutation.isPending
                ? t("devices.sshCert.reenrolling")
                : sshCertQuery.data?.enrolled
                  ? t("devices.sshCert.reenroll")
                  : t("devices.sshCert.enroll")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
