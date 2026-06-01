import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import { z } from "zod";
import type { Device } from "@iotgw/supabase-contract";
import { ErrorDisplay } from "@/components/ui/error-display";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
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
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPen,
  faTrash,
  faPlus,
  faEye,
  faEyeSlash,
  faNetworkWired,
  faWifi,
  faSearch,
  faBug,
  faHourglass,
  faRocket,
  faX,
  faKey,
} from "@fortawesome/free-solid-svg-icons";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [networkSearchQuery, setNetworkSearchQuery] = useState(
    networkName || "",
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

  const devicesQuery = useQuery(trpc.getDevices.queryOptions());
  const networksQuery = useQuery(trpc.getNetworks.queryOptions());
  const domainsQuery = useQuery(trpc.getDomains.queryOptions());

  const createDeviceMutation = useMutation({
    ...trpc.createDevice.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.getDevices.queryKey(),
      });
      setIsCreateDialogOpen(false);
      setFormData({
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
    setShowPrivateKey(false);
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
      ip_address: device.ip_address,
      private_key: device.private_key ?? "",
      public_key: device.public_key ?? "",
    });
    setShowPrivateKey(false);
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
            className={`gap-1 text-xs ${
              hasSshKey
                ? "border-green-600 text-green-600"
                : "border-amber-600 text-amber-600"
            }`}
          >
            <FontAwesomeIcon icon={faKey} className="h-3 w-3" aria-hidden="true" />
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

  const getNetworkName = (networkId: string) => {
    const network = networksQuery.data?.find((n) => n.id === networkId);
    return network?.name ?? "Unknown";
  };

  const shortenUUID = (uuid: string) => {
    // Show first 8 characters of UUID
    return uuid.slice(0, 8);
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
  const filteredDevices = useMemo(() => {
    if (!devicesQuery.data) return [];

    return devicesQuery.data.filter((device) => {
      // Filter by device name
      const matchesDeviceName = deviceSearchQuery
        ? device.name.toLowerCase().includes(deviceSearchQuery.toLowerCase())
        : true;

      // Filter by network name
      const matchesNetworkName = networkSearchQuery
        ? getNetworkName(device.network_id)
            .toLowerCase()
            .includes(networkSearchQuery.toLowerCase())
        : true;

      return matchesDeviceName && matchesNetworkName;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    devicesQuery.data,
    deviceSearchQuery,
    networkSearchQuery,
    networksQuery.data,
  ]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-7xl">
        {/* Search Filters and Create Button */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex gap-3">
            {/* Network Name Filter */}
            <div className="relative w-64">
              <FontAwesomeIcon
                icon={faSearch}
                className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                placeholder="Search by network..."
                value={networkSearchQuery}
                onChange={(e) => setNetworkSearchQuery(e.target.value)}
                className="pl-9"
              />
              {networkSearchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2"
                  onClick={() => setNetworkSearchQuery("")}
                >
                  <FontAwesomeIcon icon={faX} className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* Device Name Filter */}
            <div className="relative w-64">
              <FontAwesomeIcon
                icon={faSearch}
                className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                placeholder="Search by device name..."
                value={deviceSearchQuery}
                onChange={(e) => setDeviceSearchQuery(e.target.value)}
                className="pl-9"
              />
              {deviceSearchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2"
                  onClick={() => setDeviceSearchQuery("")}
                >
                  <FontAwesomeIcon icon={faX} className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
          >
            <DialogTrigger asChild>
              <Button onClick={handleCreateClick} className="shrink-0">
                <FontAwesomeIcon
                  icon={faPlus}
                  className="mr-2 h-4 w-4"
                  aria-hidden="true"
                />
                Create Device
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Device</DialogTitle>
                <DialogDescription>
                  Add a new device to your network infrastructure.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="create-domain" className="text-right">
                    Domain *
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
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select a domain" />
                    </SelectTrigger>
                    <SelectContent>
                      {domainsQuery.data?.map((domain) => (
                        <SelectItem key={domain.id} value={domain.id}>
                          {domain.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="create-network" className="text-right">
                    Network *
                  </Label>
                  <Select
                    value={formData.network_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, network_id: value })
                    }
                  >
                    <SelectTrigger
                      className="col-span-3"
                      disabled={!formData.domain_id}
                    >
                      <SelectValue
                        placeholder={
                          formData.domain_id
                            ? "Select a network"
                            : "Select a domain first"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredNetworks.map((network) => (
                        <SelectItem key={network.id} value={network.id}>
                          {network.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="create-name" className="text-right">
                    Name *
                  </Label>
                  <Input
                    id="create-name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Device name"
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="create-description" className="text-right">
                    Description
                  </Label>
                  <Textarea
                    id="create-description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Device description (optional)"
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="create-ip" className="text-right">
                    IP Address
                  </Label>
                  <div className="col-span-3">
                    <div className="bg-muted text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <FontAwesomeIcon
                        icon={faHourglass}
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                      <span>IP will be assigned soon</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="create-public-key" className="text-right">
                    Public Key
                  </Label>
                  <div className="col-span-3">
                    <Input
                      id="create-public-key"
                      value={formData.public_key}
                      disabled
                      placeholder="Generated automatically"
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="create-private-key" className="text-right">
                    Private Key
                  </Label>
                  <div className="col-span-3">
                    <Input
                      id="create-private-key"
                      value={formData.private_key}
                      disabled
                      placeholder="Generated automatically"
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
                    "Create Device"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Results Count */}
        {(networkSearchQuery || deviceSearchQuery) && (
          <div className="text-muted-foreground mb-3 text-sm">
            Showing {filteredDevices.length} of {devicesQuery.data?.length ?? 0}{" "}
            devices
          </div>
        )}

        <div className="border-border bg-card overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Network</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Keys</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDevices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon
                        icon={faWifi}
                        className="text-muted-foreground h-4 w-4"
                        aria-hidden="true"
                      />
                      <div>
                        <Link
                          to="/devices/$id"
                          params={{ id: device.id }}
                          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {device.name}
                        </Link>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="text-muted-foreground cursor-help font-mono text-xs">
                              {shortenUUID(device.id)}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-mono text-xs">{device.id}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon
                        icon={faNetworkWired}
                        className="text-muted-foreground h-4 w-4"
                        aria-hidden="true"
                      />
                      <div>
                        <Link
                          to="/networks"
                          search={{
                            networkName: getNetworkName(device.network_id),
                          }}
                          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {getNetworkName(device.network_id)}
                        </Link>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="text-muted-foreground cursor-help font-mono text-xs">
                              {shortenUUID(device.network_id)}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-mono text-xs">
                              {device.network_id}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono">
                      {device.ip_address}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {device.description ?? "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {renderSshKeyStatus(device.ssh_key_id ?? null)}
                      {device.public_key && (
                        <Badge variant="outline" className="text-xs">
                          Public
                        </Badge>
                      )}
                      {device.private_key && (
                        <Badge variant="outline" className="text-xs">
                          Private
                        </Badge>
                      )}
                      {!device.public_key && !device.private_key && "-"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(device.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" asChild>
                            <Link
                              to="/deployments"
                              search={{
                                deviceId: device.id,
                                networkId: device.network_id,
                                domainId: networksQuery.data?.find(
                                  (n) => n.id === device.network_id,
                                )?.domain_id,
                              }}
                            >
                              <FontAwesomeIcon
                                icon={faRocket}
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                              <span className="sr-only">
                                Deploy to {device.name}
                              </span>
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Deploy</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" asChild>
                            <Link to="/devices/$id" params={{ id: device.id }}>
                              <FontAwesomeIcon
                                icon={faEye}
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                              <span className="sr-only">
                                Details for {device.name}
                              </span>
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Details</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleTOTPClick(device)}
                          >
                            <FontAwesomeIcon
                              icon={faKey}
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                            <span className="sr-only">
                              TOTP for {device.name}
                            </span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>TOTP</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" asChild>
                            <Link
                              to="/debug/device-jobs"
                              search={{ deviceName: device.name }}
                            >
                              <FontAwesomeIcon
                                icon={faBug}
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                              <span className="sr-only">
                                Debug {device.name}
                              </span>
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Debug</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditClick(device)}
                          >
                            <FontAwesomeIcon
                              icon={faPen}
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                            <span className="sr-only">Edit {device.name}</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Edit</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(device)}
                          >
                            <FontAwesomeIcon
                              icon={faTrash}
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                            <span className="sr-only">
                              Delete {device.name}
                            </span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!filteredDevices.length && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-muted-foreground text-center"
                  >
                    {networkSearchQuery || deviceSearchQuery
                      ? "No devices match the current filters"
                      : "No devices found"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Device</DialogTitle>
            <DialogDescription>
              Update the device configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-domain" className="text-right">
                Domain *
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
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a domain" />
                </SelectTrigger>
                <SelectContent>
                  {domainsQuery.data?.map((domain) => (
                    <SelectItem key={domain.id} value={domain.id}>
                      {domain.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-network" className="text-right">
                Network *
              </Label>
              <Select
                value={formData.network_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, network_id: value })
                }
              >
                <SelectTrigger
                  className="col-span-3"
                  disabled={!formData.domain_id}
                >
                  <SelectValue
                    placeholder={
                      formData.domain_id
                        ? "Select a network"
                        : "Select a domain first"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {filteredNetworks.map((network) => (
                    <SelectItem key={network.id} value={network.id}>
                      {network.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="text-right">
                Name *
              </Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Device name"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-description" className="text-right">
                Description
              </Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Device description (optional)"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-ip" className="text-right">
                IP Address
              </Label>
              <div className="col-span-3">
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
                    <span>IP will be assigned soon</span>
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-public-key" className="text-right">
                Public Key
              </Label>
              <div className="col-span-3">
                <Input
                  id="edit-public-key"
                  value={formData.public_key}
                  disabled
                  placeholder="Not set"
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-private-key" className="text-right">
                Private Key
              </Label>
              <div className="col-span-3">
                <Input
                  id="edit-private-key"
                  value={formData.private_key ? "••••••••" : ""}
                  disabled
                  placeholder="Not set"
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
                "Save Changes"
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Device</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedDevice?.name}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteDeviceMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteDeviceMutation.isPending ? <LoadingSpinner /> : "Delete"}
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
          totpCounter={selectedDevice.totp_counter ?? 0}
        />
      )}
    </div>
  );
}
