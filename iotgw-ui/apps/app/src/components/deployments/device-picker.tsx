import { useRef, useState } from "react";
import { Search, Server, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  DeploymentDevice,
  DeploymentDomain,
  DeploymentNetwork,
} from "@/lib/deployment-workspace";

export function DeploymentDevicePicker({
  open,
  onOpenChange,
  devices,
  domains,
  networks,
  onSelect,
  initialDomainId,
  initialNetworkId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: DeploymentDevice[];
  domains: DeploymentDomain[];
  networks: DeploymentNetwork[];
  onSelect: (device: DeploymentDevice) => void;
  initialDomainId?: string;
  initialNetworkId?: string;
}) {
  const { t } = useTranslation();
  const selection = useRef<DeploymentDevice | null>(null);
  const [search, setSearch] = useState("");
  const [domainId, setDomainId] = useState(initialDomainId ?? "all");
  const [networkId, setNetworkId] = useState(initialNetworkId ?? "all");
  const filteredNetworks = networks.filter(
    (n) => domainId === "all" || n.domain_id === domainId,
  );
  const matches = devices.filter((device) => {
    const network = networks.find((n) => n.id === device.network_id);
    const domain = domains.find((d) => d.id === network?.domain_id);
    const text = [
      device.name,
      device.ip_address,
      network?.name,
      domain?.display_name,
      domain?.name,
    ]
      .join(" ")
      .toLowerCase();
    return (
      (domainId === "all" || network?.domain_id === domainId) &&
      (networkId === "all" || device.network_id === networkId) &&
      search
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .every((term) => text.includes(term))
    );
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        onCloseAutoFocus={(event) => {
          const selected = selection.current;
          selection.current = null;
          if (selected) {
            event.preventDefault();
            // Let the picker release its focus/pointer lock before a navigation guard opens.
            requestAnimationFrame(() => onSelect(selected));
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("deployments.workspace.chooseDevice")}</DialogTitle>
          <DialogDescription>
            {t("deployments.workspace.chooseDeviceHelp")}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search
            className="text-muted-foreground absolute top-3 left-3 size-4"
            aria-hidden="true"
          />
          <Input
            aria-label={t("deployments.workspace.searchDevices")}
            placeholder={t("deployments.workspace.searchDevices")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="deployment-domain">{t("domains.domain")}</Label>
            <Select
              value={domainId}
              onValueChange={(value) => {
                setDomainId(value);
                setNetworkId("all");
              }}
            >
              <SelectTrigger id="deployment-domain" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("deployments.workspace.allDomains")}
                </SelectItem>
                {domains.map((domain) => (
                  <SelectItem value={domain.id} key={domain.id}>
                    {domain.display_name ?? domain.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="deployment-network">{t("networks.network")}</Label>
            <Select value={networkId} onValueChange={setNetworkId}>
              <SelectTrigger id="deployment-network" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("deployments.workspace.allNetworks")}
                </SelectItem>
                {filteredNetworks.map((network) => (
                  <SelectItem value={network.id} key={network.id}>
                    {network.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-muted-foreground text-xs" aria-live="polite">
          {t("deployments.workspace.deviceCount", { count: matches.length })}
        </p>
        <div
          className="max-h-[42dvh] space-y-2 overflow-y-auto"
          aria-label={t("deployments.workspace.devices")}
        >
          {matches.map((device) => {
            const network = networks.find((n) => n.id === device.network_id);
            const domain = domains.find((d) => d.id === network?.domain_id);
            return (
              <Button
                key={device.id}
                variant="outline"
                className="h-auto w-full justify-start gap-3 px-4 py-3 text-left whitespace-normal"
                onClick={() => {
                  selection.current = device;
                  onOpenChange(false);
                }}
              >
                <Server className="text-muted-foreground size-5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {device.name}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {domain?.display_name ?? domain?.name} / {network?.name}
                  </span>
                  <span className="text-muted-foreground block font-mono text-xs">
                    {device.ip_address ?? t("deployments.workspace.noIp")}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0" />
              </Button>
            );
          })}
          {matches.length === 0 && (
            <div className="space-y-3 py-8 text-center">
              <p className="text-muted-foreground text-sm">
                {t("deployments.workspace.noDevices")}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setDomainId("all");
                  setNetworkId("all");
                }}
              >
                {t("deployments.workspace.clearFilters")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
