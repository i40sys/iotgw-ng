import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { X, Filter } from "lucide-react";
import { trpc } from "@/utils/trpc";
import type { Device, Domain, Network } from "@iotgw/supabase-contract";

export interface DeviceWithDetails extends Device {
  network?: Network & { domain?: Domain };
}

export interface DeviceSelectionState {
  selectedDevice?: DeviceWithDetails;
  domainFilter?: string;
  networkFilter?: string;
}

interface DeviceSelectionPanelProps {
  onDeviceChange?: (device: DeviceWithDetails | undefined) => void;
  onSelectionStateChange?: (state: DeviceSelectionState) => void;
  onDeviceChangeRequested?: (
    device: DeviceWithDetails | undefined,
    callback: () => void,
  ) => void;
  initialSelection?: DeviceSelectionState;
  className?: string;
}

export function DeviceSelectionPanel({
  onDeviceChange,
  onSelectionStateChange,
  onDeviceChangeRequested,
  initialSelection,
  className,
}: DeviceSelectionPanelProps) {
  const { t } = useTranslation();

  // Local state for filters
  const [domainFilter, setDomainFilter] = React.useState<string | undefined>(
    initialSelection?.domainFilter,
  );
  const [networkFilter, setNetworkFilter] = React.useState<string | undefined>(
    initialSelection?.networkFilter,
  );
  const [selectedDevice, setSelectedDevice] = React.useState<
    DeviceWithDetails | undefined
  >(initialSelection?.selectedDevice);

  // Fetch domains
  const { data: domains, isLoading: domainsLoading } =
    trpc.domains.getDomains.useQuery();

  // Fetch networks based on domain filter
  const { data: networks, isLoading: networksLoading } =
    trpc.networks.getNetworksByDomain.useQuery(
      { domain_id: domainFilter! },
      { enabled: Boolean(domainFilter) },
    );

  // Fetch all networks when no domain is selected for cascading
  const { data: allNetworks } = trpc.networks.getNetworks.useQuery(
    {},
    { enabled: !domainFilter },
  );

  // Fetch devices based on filters
  const { data: devices, isLoading: devicesLoading } =
    trpc.devices.getDevicesFiltered.useQuery({
      domain_id: domainFilter,
      network_id: networkFilter,
    });

  // Available networks for dropdown
  const availableNetworks = React.useMemo(() => {
    if (domainFilter) {
      return networks ?? [];
    }
    return allNetworks ?? [];
  }, [domainFilter, networks, allNetworks]);

  // Update parent when selection state changes
  React.useEffect(() => {
    const newState: DeviceSelectionState = {
      selectedDevice,
      domainFilter,
      networkFilter,
    };

    onSelectionStateChange?.(newState);
    onDeviceChange?.(selectedDevice);
  }, [
    selectedDevice,
    domainFilter,
    networkFilter,
    onSelectionStateChange,
    onDeviceChange,
  ]);

  // Handle domain filter change
  const handleDomainChange = (value: string) => {
    const newDomainFilter = value === "all" ? undefined : value;
    setDomainFilter(newDomainFilter);

    // Reset network and device selection when domain changes
    setNetworkFilter(undefined);
    setSelectedDevice(undefined);
  };

  // Handle network filter change
  const handleNetworkChange = (value: string) => {
    const newNetworkFilter = value === "all" ? undefined : value;
    setNetworkFilter(newNetworkFilter);

    // Reset device selection when network changes
    setSelectedDevice(undefined);
  };

  // Handle device selection
  const handleDeviceChange = (value: string) => {
    const device = devices?.find((d) => d.id === value);

    if (onDeviceChangeRequested) {
      onDeviceChangeRequested(device, () => {
        setSelectedDevice(device);
      });
    } else {
      setSelectedDevice(device);
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setDomainFilter(undefined);
    setNetworkFilter(undefined);
    setSelectedDevice(undefined);
  };

  // Get device status badge
  const getDeviceStatusBadge = (device: DeviceWithDetails) => {
    // Since status might be computed or come from a different source,
    // we'll check if there's a status field or default to "unknown"
    const deviceWithStatus = device as DeviceWithDetails & { status?: string };
    const status = deviceWithStatus.status ?? "unknown";

    const getStatusVariant = (
      status: string,
    ): "default" | "secondary" | "destructive" | "outline" => {
      switch (status.toLowerCase()) {
        case "online":
          return "default";
        case "offline":
          return "secondary";
        case "maintenance":
          return "destructive";
        default:
          return "outline";
      }
    };

    return (
      <Badge variant={getStatusVariant(status)} className="ml-2 text-xs">
        {status}
      </Badge>
    );
  };

  const hasActiveFilters =
    Boolean(domainFilter) || Boolean(networkFilter) || Boolean(selectedDevice);

  return (
    <div
      className={`bg-card space-y-4 rounded-lg border p-4 ${className ?? ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="text-muted-foreground h-4 w-4" />
          <h3 className="text-sm font-medium">
            {t("devices.deviceSelection")}
          </h3>
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-xs"
          >
            <X className="mr-1 h-3 w-3" />
            {t("common.clearFilters")}
          </Button>
        )}
      </div>

      {/* Filter Controls */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Domain Filter */}
        <div className="space-y-2">
          <label className="text-muted-foreground text-xs font-medium">
            {t("domains.domain")}
          </label>
          <Select
            value={domainFilter ?? "all"}
            onValueChange={handleDomainChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("domains.selectDomain")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {domainsLoading && (
                <SelectItem value="loading" disabled>
                  <LoadingSpinner /> {t("common.loading")}
                </SelectItem>
              )}
              {domains?.map((domain) => (
                <SelectItem key={domain.id} value={domain.id}>
                  {domain.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Network Filter */}
        <div className="space-y-2">
          <label className="text-muted-foreground text-xs font-medium">
            {t("networks.network")}
          </label>
          <Select
            value={networkFilter ?? "all"}
            onValueChange={handleNetworkChange}
            disabled={!domainFilter && availableNetworks.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("networks.selectNetwork")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {networksLoading && (
                <SelectItem value="loading" disabled>
                  <LoadingSpinner /> {t("common.loading")}
                </SelectItem>
              )}
              {availableNetworks.map((network) => (
                <SelectItem key={network.id} value={network.id}>
                  {network.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Device Selection */}
        <div className="space-y-2">
          <label className="text-muted-foreground text-xs font-medium">
            {t("devices.device")}
          </label>
          <Select
            value={selectedDevice?.id ?? ""}
            onValueChange={handleDeviceChange}
            disabled={!devices || devices.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("devices.selectDevice")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t("devices.noDeviceSelected")}</SelectItem>
              {devicesLoading && (
                <SelectItem value="loading" disabled>
                  <LoadingSpinner /> {t("common.loading")}
                </SelectItem>
              )}
              {devices?.map((device) => (
                <SelectItem key={device.id} value={device.id}>
                  <div className="flex w-full items-center justify-between">
                    <span>{device.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {device.ip_address}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Selected Device Display */}
      {selectedDevice && (
        <div className="bg-muted/50 border-l-primary mt-4 rounded-md border-l-4 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium">{selectedDevice.name}</span>
              {getDeviceStatusBadge(selectedDevice)}
            </div>
            <div className="text-muted-foreground text-xs">
              {selectedDevice.ip_address}
            </div>
          </div>
          {selectedDevice.description && (
            <p className="text-muted-foreground mt-1 text-xs">
              {selectedDevice.description}
            </p>
          )}
          <div className="text-muted-foreground mt-2 text-xs">
            {selectedDevice.network?.name && (
              <span>
                {t("networks.network")}: {selectedDevice.network.name}
              </span>
            )}
            {selectedDevice.network?.domain?.display_name && (
              <span className="ml-4">
                {t("domains.domain")}:{" "}
                {selectedDevice.network.domain.display_name}
              </span>
            )}
          </div>
        </div>
      )}

      {/* No devices message */}
      {!devicesLoading &&
        devices &&
        devices.length === 0 &&
        hasActiveFilters && (
          <div className="text-muted-foreground py-4 text-center text-sm">
            {t("devices.noDevicesFound")}
          </div>
        )}
    </div>
  );
}

export default DeviceSelectionPanel;
