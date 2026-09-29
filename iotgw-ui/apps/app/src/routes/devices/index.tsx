import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import { z } from "zod";
import type { Device } from "@iotgw/supabase-contract";
import { ErrorDisplay } from "@/components/ui/error-display";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  InventoryActions,
  InventoryDate,
  InventoryList,
  InventoryToolbar,
  type InventoryColumn,
} from "@/components/inventory-list";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { matchesInventorySearch } from "@/lib/inventory";
import { ipSortValue, useTableSort } from "@/hooks/use-table-sort";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Pencil,
  Trash2,
  ListChecks,
  Eye,
  KeyRound,
  Rocket,
  LoaderCircle,
} from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faHourglass,
  faKey,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { DeviceTOTPDialog } from "@/components/device-totp-dialog";

const devicesSearchSchema = z.object({
  networkName: z.string().optional(),
  domainId: z.string().optional(),
  networkId: z.string().optional(),
});

export const Route = createFileRoute("/devices/")({
  loader: async ({ context }) => {
    const { queryClient, trpc } = context;
    await queryClient.ensureQueryData(trpc.getDevices.queryOptions());
    await queryClient.ensureQueryData(trpc.getNetworks.queryOptions());
    await queryClient.ensureQueryData(trpc.getDomains.queryOptions());
    return {};
  },
  errorComponent: ({ error }) => (
    <ErrorDisplay
      error={error instanceof Error ? error : new Error("Unknown error")}
    />
  ),
  pendingComponent: () => <LoadingSpinner />,
  validateSearch: devicesSearchSchema,
  component: DevicesPage,
});

interface DeviceFormData {
  domain_id: string;
  network_id: string;
  name: string;
  description: string;
  ip_address: string;
  private_key: string;
  public_key: string;
}

function DevicesPage() {
  const { t } = useTranslation();
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { networkName, domainId, networkId } = Route.useSearch();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isTOTPDialogOpen, setIsTOTPDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [networkSearchQuery, setNetworkSearchQuery] = useState(
    networkName ?? "",
  );
  const [deviceSearchQuery, setDeviceSearchQuery] = useState("");
  const [formData, setFormData] = useState<DeviceFormData>({
    domain_id: "",
    network_id: "",
    name: "",
    description: "",
    ip_address: "",
    private_key: "",
    public_key: "",
  });

  // Device provisioning is asynchronous: the SSH key is minted synchronously at
  // creation, but the WireGuard public/private keys + IP are written by the
  // background netmaker-call job. Poll the jobs (and devices) while anything is
  // still provisioning so the Keys column can show a spinner that resolves into
  // the Public/Private badges without a manual reload.
  const ACTIVE_JOB = new Set(["PENDING", "RUNNING"]);

  const deviceJobsQuery = useQuery({
    ...trpc.listDeviceJobs.queryOptions({}),
    refetchInterval: (query) => {
      const jobs = (query.state.data ?? []) as { status: string }[];
      return jobs.some((j) => ACTIVE_JOB.has(j.status)) ? 2000 : false;
    },
  });

  const latestJobByDevice = useMemo(() => {
    // get_device_jobs is ordered by started_at desc, so the first row seen per
    // device is its most recent job.
    const map = new Map<string, { status: string }>();
    for (const job of (deviceJobsQuery.data ?? []) as {
      device_id: string | null;
      status: string;
    }[]) {
      if (job.device_id && !map.has(job.device_id)) map.set(job.device_id, job);
    }
    return map;
  }, [deviceJobsQuery.data]);

  const isDeviceProvisioning = (device: Device): boolean => {
    // The public key marks provisioning done: since decision-035 the private key
    // may be gateway-held, so devices.private_key is legitimately null.
    if (device.public_key) return false;
    const job = latestJobByDevice.get(device.id);
    if (job && ACTIVE_JOB.has(job.status)) return true; // in progress
    if (job && job.status === "SUCCESS") return true; // keys not synced yet
    if (!job) {
      // The job row appears within ~1s of creation — spin briefly until it does.
      return (
        device.created_at !== null &&
        Date.now() - new Date(device.created_at).getTime() < 30_000
      );
    }
    return false; // FAILED
  };

  const devicesQuery = useQuery({
    ...trpc.getDevices.queryOptions(),
    refetchInterval: (query) => {
      const devices = (query.state.data ?? []) as Device[];
      return devices.some((d) => isDeviceProvisioning(d)) ? 2000 : false;
    },
  });
  const networksQuery = useQuery(trpc.getNetworks.queryOptions());
  const domainsQuery = useQuery(trpc.getDomains.queryOptions());
  const networkById = useMemo(
    () =>
      new Map(
        (networksQuery.data ?? []).map((network) => [network.id, network]),
      ),
    [networksQuery.data],
  );

  const createDeviceMutation = useMutation({
    ...trpc.createDevice.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.getDevices.queryKey(),
      });
      // Pick up the new provisioning job so the Keys column starts polling.
      void queryClient.invalidateQueries({
        queryKey: trpc.listDeviceJobs.queryKey(),
      });
      setIsCreateDialogOpen(false);
      setFormData({
        domain_id: "",
        network_id: "",
        name: "",
        description: "",
        ip_address: "",
        private_key: "",
        public_key: "",
      });
      toast.success("Device created successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create device");
    },
  });

  const updateDeviceMutation = useMutation({
    ...trpc.updateDevice.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.getDevices.queryKey(),
      });
      setIsEditDialogOpen(false);
      setSelectedDevice(null);
      setFormData({
        domain_id: "",
        network_id: "",
        name: "",
        description: "",
        ip_address: "",
        private_key: "",
        public_key: "",
      });
      toast.success("Device updated successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update device");
    },
  });

  const deleteDeviceMutation = useMutation({
    ...trpc.deleteDevice.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.getDevices.queryKey(),
      });
      setIsDeleteDialogOpen(false);
      setSelectedDevice(null);
      toast.success("Device deleted successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete device");
    },
  });

  const handleCreateClick = () => {
    // Find network by name if networkName is provided
    let selectedNetworkId = networkId ?? "";
    let selectedDomainId = domainId ?? "";

    if (networkName && networksQuery.data) {
      const network = networksQuery.data.find(
        (n) => n.name.toLowerCase() === networkName.toLowerCase(),
      );
      if (network) {
        selectedNetworkId = network.id;
        selectedDomainId = network.domain_id;
      }
    }

    setFormData({
      domain_id: selectedDomainId,
      network_id: selectedNetworkId,
      name: "",
      description: "",
      ip_address: "",
      private_key: "",
      public_key: "",
    });
    setIsCreateDialogOpen(true);
  };

  const handleEditClick = (device: Device) => {
    setSelectedDevice(device);
    const network = networksQuery.data?.find((n) => n.id === device.network_id);
    setFormData({
      domain_id: network?.domain_id ?? "",
      network_id: device.network_id,
      name: device.name,
      description: device.description ?? "",
      ip_address: device.ip_address ?? "",
      private_key: device.private_key ?? "",
      public_key: device.public_key ?? "",
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = (device: Device) => {
    setSelectedDevice(device);
    setIsDeleteDialogOpen(true);
  };

  const renderSshKeyStatus = (sshKeyId: string | null) => {
    const hasSshKey = Boolean(sshKeyId);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`gap-1 text-xs whitespace-nowrap ${
              hasSshKey
                ? "border-green-600 text-green-600"
                : "border-amber-600 text-amber-600"
            }`}
          >
            <FontAwesomeIcon
              icon={faKey}
              className="h-3 w-3"
              aria-hidden="true"
            />
            {hasSshKey
              ? t("devices.sshKey.label")
              : t("devices.sshKey.labelMissing")}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {hasSshKey
              ? t("devices.sshKey.configured")
              : t("devices.sshKey.notConfigured")}
          </p>
          {hasSshKey ? (
            <p className="text-muted-foreground font-mono text-xs">
              {sshKeyId}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              {t("devices.sshKey.willBeGenerated")}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  const handleTOTPClick = (device: Device) => {
    setSelectedDevice(device);
    setIsTOTPDialogOpen(true);
  };

  const handleCreateSubmit = () => {
    if (!formData.network_id || !formData.name) {
      toast.error("Please fill in all required fields");
      return;
    }
    createDeviceMutation.mutate({
      network_id: formData.network_id,
      name: formData.name,
      description: formData.description ?? null,
      ip_address: null,
      private_key: null,
      public_key: null,
    });
  };

  const handleEditSubmit = () => {
    if (!selectedDevice || !formData.name) {
      toast.error("Please fill in all required fields");
      return;
    }
    // Only send editable fields: network_id, name, and description
    // IP address and keys are read-only and managed elsewhere
    updateDeviceMutation.mutate({
      id: selectedDevice.id,
      network_id: formData.network_id,
      name: formData.name,
      description: formData.description ?? null,
    });
  };

  const handleDeleteConfirm = () => {
    if (!selectedDevice) return;
    deleteDeviceMutation.mutate({ id: selectedDevice.id });
  };

  // Filter networks based on selected domain
  const filteredNetworks = useMemo(() => {
    if (!networksQuery.data) return [];
    if (!formData.domain_id) return [];
    return networksQuery.data.filter(
      (network) => network.domain_id === formData.domain_id,
    );
  }, [networksQuery.data, formData.domain_id]);

  // Filter devices based on search queries
  type DeviceSortKey =
    | "name"
    | "network"
    | "ip"
    | "description"
    | "keys"
    | "created";

  const filteredDevices = useMemo(
    () =>
      (devicesQuery.data ?? []).filter(
        (device) =>
          matchesInventorySearch(
            deviceSearchQuery,
            device.name,
            device.id,
            device.description,
            device.ip_address,
          ) &&
          matchesInventorySearch(
            networkSearchQuery,
            networkById.get(device.network_id)?.name,
            device.network_id,
          ),
      ),
    [devicesQuery.data, deviceSearchQuery, networkSearchQuery, networkById],
  );

  const sortAccessors = useMemo(
    () => ({
      name: (d: Device) => d.name,
      network: (d: Device) => networkById.get(d.network_id)?.name,
      ip: (d: Device) => ipSortValue(d.ip_address),
      description: (d: Device) => d.description,
      // 2 = KMS key + WireGuard keys, 1 = KMS key only, 0 = nothing yet
      keys: (d: Device) =>
        (d.ssh_key_id ? 1 : 0) + (d.public_key && d.private_key ? 1 : 0),
      created: (d: Device) =>
        d.created_at ? new Date(d.created_at).getTime() : null,
    }),
    [networkById],
  );
  const {
    sort,
    setSort,
    toggleSort,
    sortedRows: sortedDevices,
  } = useTableSort<Device, DeviceSortKey>(filteredDevices, sortAccessors);

  const columns: InventoryColumn<Device, DeviceSortKey>[] = [
    {
      key: "device",
      label: t("devices.device"),
      sortKey: "name",
      render: (device) => (
        <div className="space-y-1.5">
          <Link
            to="/devices/$id"
            params={{ id: device.id }}
            className="text-primary font-semibold hover:underline"
          >
            {device.name}
          </Link>
          <p className="text-muted-foreground font-mono text-xs">{device.id}</p>
          {device.description && (
            <p className="text-sm">{device.description}</p>
          )}
        </div>
      ),
    },
    {
      key: "network",
      label: t("inventory.networkAndAddress"),
      sortKey: "network",
      className: "w-[26%]",
      render: (device) => {
        const network = networkById.get(device.network_id);
        return (
          <div className="space-y-2">
            <div className="space-y-1">
              {network ? (
                <Link
                  to="/networks"
                  search={{ networkName: network.name }}
                  className="text-primary font-medium hover:underline"
                >
                  {network.name}
                </Link>
              ) : (
                <p>{t("inventory.notAvailable")}</p>
              )}
              <p className="text-muted-foreground font-mono text-xs">
                {device.network_id}
              </p>
            </div>
            <dl className="text-xs">
              <dt className="text-muted-foreground">
                {t("devices.ipAddress")}
              </dt>
              <dd className="mt-1 font-mono">
                {device.ip_address ?? t("inventory.notAssigned")}
              </dd>
            </dl>
          </div>
        );
      },
    },
    {
      key: "keys",
      label: t("inventory.keys"),
      sortKey: "keys",
      className: "w-40",
      render: (device) => (
        <div className="space-y-2">
          {renderSshKeyStatus(device.ssh_key_id)}
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">WireGuard</p>
            <div className="flex flex-wrap gap-1">
              {device.public_key && (
                <Badge variant="secondary">{t("inventory.publicKey")}</Badge>
              )}
              {device.private_key && (
                <Badge variant="secondary">{t("inventory.privateKey")}</Badge>
              )}
              {!device.public_key &&
                (isDeviceProvisioning(device) ? (
                  <Badge
                    variant="outline"
                    className="max-w-full gap-1 whitespace-normal"
                  >
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-3 shrink-0 animate-spin"
                    />
                    {t("inventory.provisioning")}
                  </Badge>
                ) : latestJobByDevice.get(device.id)?.status === "FAILED" ? (
                  <Badge variant="destructive" className="whitespace-normal">
                    {t("inventory.failed")}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {t("inventory.notConfigured")}
                  </span>
                ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "created",
      label: t("inventory.created"),
      sortKey: "created",
      className: "w-32",
      render: (device) => <InventoryDate value={device.created_at} />,
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="@container mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("devices.title")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("inventory.devicesDescription")}
            </p>
          </div>
          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
          >
            <DialogTrigger asChild>
              <Button
                onClick={handleCreateClick}
                className="min-h-11 w-full sm:w-auto"
              >
                <FontAwesomeIcon
                  icon={faPlus}
                  className="mr-2 h-4 w-4"
                  aria-hidden="true"
                />
                {t("inventory.createDevice")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto [overflow-wrap:anywhere] sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t("inventory.createDevice")}</DialogTitle>
                <DialogDescription>
                  {t("inventory.createDeviceDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label htmlFor="create-domain" className="sm:text-right">
                    {t("inventory.domainRequired")}
                  </Label>
                  <Select
                    value={formData.domain_id}
                    onValueChange={(value) => {
                      setFormData({
                        ...formData,
                        domain_id: value,
                        network_id: "",
                      });
                    }}
                  >
                    <SelectTrigger
                      id="create-domain"
                      className="h-auto min-h-10 min-w-0 text-left whitespace-normal sm:col-span-3 [&>span]:line-clamp-none [&>span]:[overflow-wrap:anywhere] [&>svg]:shrink-0"
                    >
                      <SelectValue placeholder={t("inventory.selectDomain")} />
                    </SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-3rem)] [&_[role=option]]:[overflow-wrap:anywhere]">
                      {domainsQuery.data?.map((domain) => (
                        <SelectItem key={domain.id} value={domain.id}>
                          {domain.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label htmlFor="create-network" className="sm:text-right">
                    {t("inventory.networkRequired")}
                  </Label>
                  <Select
                    value={formData.network_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, network_id: value })
                    }
                  >
                    <SelectTrigger
                      id="create-network"
                      className="h-auto min-h-10 min-w-0 text-left whitespace-normal sm:col-span-3 [&>span]:line-clamp-none [&>span]:[overflow-wrap:anywhere] [&>svg]:shrink-0"
                      disabled={!formData.domain_id}
                    >
                      <SelectValue
                        placeholder={
                          formData.domain_id
                            ? t("inventory.selectNetwork")
                            : t("inventory.selectDomainFirst")
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-3rem)] [&_[role=option]]:[overflow-wrap:anywhere]">
                      {filteredNetworks.map((network) => (
                        <SelectItem key={network.id} value={network.id}>
                          {network.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label htmlFor="create-name" className="sm:text-right">
                    {t("inventory.nameRequired")}
                  </Label>
                  <Input
                    id="create-name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder={t("inventory.deviceNamePlaceholder")}
                    className="min-w-0 sm:col-span-3"
                  />
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label htmlFor="create-description" className="sm:text-right">
                    {t("inventory.description")}
                  </Label>
                  <Textarea
                    id="create-description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder={t("inventory.deviceDescriptionPlaceholder")}
                    className="min-w-0 sm:col-span-3"
                  />
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label htmlFor="create-ip" className="sm:text-right">
                    {t("inventory.ipAddress")}
                  </Label>
                  <div className="min-w-0 sm:col-span-3">
                    <div className="bg-muted text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <FontAwesomeIcon
                        icon={faHourglass}
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                      <span>{t("inventory.ipPending")}</span>
                    </div>
                  </div>
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label htmlFor="create-public-key" className="sm:text-right">
                    {t("inventory.publicKeyLabel")}
                  </Label>
                  <div className="min-w-0 sm:col-span-3">
                    <Input
                      id="create-public-key"
                      value={formData.public_key}
                      disabled
                      placeholder={t("inventory.generatedAutomatically")}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label htmlFor="create-private-key" className="sm:text-right">
                    {t("inventory.privateKeyLabel")}
                  </Label>
                  <div className="min-w-0 sm:col-span-3">
                    <Input
                      id="create-private-key"
                      value={formData.private_key}
                      disabled
                      placeholder={t("inventory.generatedAutomatically")}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  onClick={handleCreateSubmit}
                  disabled={createDeviceMutation.isPending}
                >
                  {createDeviceMutation.isPending ? (
                    <LoadingSpinner />
                  ) : (
                    t("inventory.createDevice")
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <section
          className="bg-card overflow-hidden rounded-lg border"
          aria-label={t("devices.title")}
        >
          <InventoryToolbar
            searches={[
              {
                label: t("inventory.searchDevices"),
                placeholder: t("inventory.deviceSearchPlaceholder"),
                value: deviceSearchQuery,
                onChange: setDeviceSearchQuery,
              },
              {
                label: t("inventory.filterNetwork"),
                placeholder: t("inventory.networkFilterPlaceholder"),
                value: networkSearchQuery,
                onChange: setNetworkSearchQuery,
              },
            ]}
            sort={sort}
            onSortChange={setSort}
            sortOptions={[
              { key: "name", label: t("inventory.name") },
              { key: "network", label: t("networks.network") },
              { key: "ip", label: t("devices.ipAddress") },
              { key: "description", label: t("inventory.description") },
              { key: "keys", label: t("inventory.keys") },
              { key: "created", label: t("inventory.created") },
            ]}
            count={filteredDevices.length}
            total={devicesQuery.data?.length ?? 0}
            onRefresh={() => {
              void devicesQuery.refetch();
              void networksQuery.refetch();
              void domainsQuery.refetch();
              void deviceJobsQuery.refetch();
            }}
            isRefreshing={
              devicesQuery.isFetching ||
              networksQuery.isFetching ||
              domainsQuery.isFetching ||
              deviceJobsQuery.isFetching
            }
          />
          <InventoryList
            rows={sortedDevices}
            columns={columns}
            sort={sort}
            onSort={toggleSort}
            label={t("devices.title")}
            emptyMessage={
              deviceSearchQuery.trim() || networkSearchQuery.trim()
                ? t("inventory.noMatches")
                : t("devices.noDevices")
            }
            actions={(device) => (
              <InventoryActions
                name={device.name}
                disabled={
                  updateDeviceMutation.isPending ||
                  deleteDeviceMutation.isPending
                }
                primary={
                  <Button variant="secondary" size="sm" asChild>
                    <Link
                      to="/deployments"
                      search={{
                        deviceId: device.id,
                        networkId: device.network_id,
                        domainId: networkById.get(device.network_id)?.domain_id,
                      }}
                    >
                      <Rocket aria-hidden="true" className="size-4" />
                      {t("inventory.deploy")}
                    </Link>
                  </Button>
                }
              >
                <DropdownMenuItem asChild>
                  <Link to="/devices/$id" params={{ id: device.id }}>
                    <Eye aria-hidden="true" />
                    {t("inventory.details")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleTOTPClick(device)}>
                  <KeyRound aria-hidden="true" />
                  {t("inventory.oneTimeCode")}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    to="/debug/device-jobs"
                    search={{ deviceName: device.name }}
                  >
                    <ListChecks aria-hidden="true" />
                    {t("inventory.viewJobs")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => handleEditClick(device)}>
                  <Pencil aria-hidden="true" />
                  {t("inventory.editDevice")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => handleDeleteClick(device)}
                >
                  <Trash2 aria-hidden="true" />
                  {t("inventory.deleteDevice")}
                </DropdownMenuItem>
              </InventoryActions>
            )}
          />
        </section>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto [overflow-wrap:anywhere] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("inventory.editDevice")}</DialogTitle>
            <DialogDescription>
              {t("inventory.editDeviceDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="edit-domain" className="sm:text-right">
                {t("inventory.domainRequired")}
              </Label>
              <Select
                value={formData.domain_id}
                onValueChange={(value) => {
                  setFormData({
                    ...formData,
                    domain_id: value,
                    network_id: "",
                  });
                }}
              >
                <SelectTrigger
                  id="edit-domain"
                  className="h-auto min-h-10 min-w-0 text-left whitespace-normal sm:col-span-3 [&>span]:line-clamp-none [&>span]:[overflow-wrap:anywhere] [&>svg]:shrink-0"
                >
                  <SelectValue placeholder={t("inventory.selectDomain")} />
                </SelectTrigger>
                <SelectContent className="max-w-[calc(100vw-3rem)] [&_[role=option]]:[overflow-wrap:anywhere]">
                  {domainsQuery.data?.map((domain) => (
                    <SelectItem key={domain.id} value={domain.id}>
                      {domain.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="edit-network" className="sm:text-right">
                {t("inventory.networkRequired")}
              </Label>
              <Select
                value={formData.network_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, network_id: value })
                }
              >
                <SelectTrigger
                  id="edit-network"
                  className="h-auto min-h-10 min-w-0 text-left whitespace-normal sm:col-span-3 [&>span]:line-clamp-none [&>span]:[overflow-wrap:anywhere] [&>svg]:shrink-0"
                  disabled={!formData.domain_id}
                >
                  <SelectValue
                    placeholder={
                      formData.domain_id
                        ? t("inventory.selectNetwork")
                        : t("inventory.selectDomainFirst")
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-w-[calc(100vw-3rem)] [&_[role=option]]:[overflow-wrap:anywhere]">
                  {filteredNetworks.map((network) => (
                    <SelectItem key={network.id} value={network.id}>
                      {network.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="edit-name" className="sm:text-right">
                {t("inventory.nameRequired")}
              </Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t("inventory.deviceNamePlaceholder")}
                className="min-w-0 sm:col-span-3"
              />
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="edit-description" className="sm:text-right">
                {t("inventory.description")}
              </Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t("inventory.deviceDescriptionPlaceholder")}
                className="min-w-0 sm:col-span-3"
              />
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="edit-ip" className="sm:text-right">
                {t("inventory.ipAddress")}
              </Label>
              <div className="min-w-0 sm:col-span-3">
                {formData.ip_address ? (
                  <Input
                    id="edit-ip"
                    value={formData.ip_address}
                    disabled
                    className="font-mono"
                  />
                ) : (
                  <div className="bg-muted text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <FontAwesomeIcon
                      icon={faHourglass}
                      className="h-4 w-4"
                      aria-hidden="true"
                    />
                    <span>{t("inventory.ipPending")}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="edit-public-key" className="sm:text-right">
                {t("inventory.publicKeyLabel")}
              </Label>
              <div className="min-w-0 sm:col-span-3">
                <Input
                  id="edit-public-key"
                  value={formData.public_key}
                  disabled
                  placeholder={t("inventory.notConfigured")}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="edit-private-key" className="sm:text-right">
                {t("inventory.privateKeyLabel")}
              </Label>
              <div className="min-w-0 sm:col-span-3">
                <Input
                  id="edit-private-key"
                  value={formData.private_key ? "••••••••" : ""}
                  disabled
                  placeholder={t("inventory.notConfigured")}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              onClick={handleEditSubmit}
              disabled={updateDeviceMutation.isPending}
            >
              {updateDeviceMutation.isPending ? (
                <LoadingSpinner />
              ) : (
                t("inventory.saveChanges")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto [overflow-wrap:anywhere]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("inventory.deleteDevice")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("inventory.confirmDeleteDevice", {
                name: selectedDevice?.name,
              })}
            </AlertDialogDescription>
            <div className="mt-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              <FontAwesomeIcon
                icon={faTriangleExclamation}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>{t("devices.sshCert.deleteWarning")}</span>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("buttons.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteDeviceMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteDeviceMutation.isPending ? (
                <LoadingSpinner />
              ) : (
                t("buttons.delete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* TOTP Dialog */}
      {selectedDevice && (
        <DeviceTOTPDialog
          open={isTOTPDialogOpen}
          onOpenChange={setIsTOTPDialogOpen}
          deviceId={selectedDevice.id}
          networkId={selectedDevice.network_id}
          domainId={
            networksQuery.data?.find((n) => n.id === selectedDevice.network_id)
              ?.domain_id ?? ""
          }
          deviceName={selectedDevice.name}
        />
      )}
    </div>
  );
}
