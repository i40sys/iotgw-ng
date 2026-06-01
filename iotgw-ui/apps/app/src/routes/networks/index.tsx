import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import { z } from "zod";
import type { Network } from "@iotgw/supabase-contract";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Pencil,
  Trash2,
  Plus,
  Network as NetworkIcon,
  Search,
  Bug,
  X,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";

const networksSearchSchema = z.object({
  networkName: z.string().optional(),
});

export const Route = createFileRoute("/networks/")({
  loader: async ({ context }) => {
    const { queryClient, trpc } = context;
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
  validateSearch: networksSearchSchema,
  component: NetworksPage,
});

interface NetworkFormData {
  name: string;
  ipv4_cidr?: string;
  ipv6_cidr?: string;
  domain_id?: string;
}

type NetworkWithDomain = Network & {
  domain?: {
    id: string;
    name: string;
    display_name: string;
  } | null;
};

function NetworksPage() {
  const { t } = useTranslation();
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { networkName } = Route.useSearch();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedNetwork, setSelectedNetwork] =
    useState<NetworkWithDomain | null>(null);
  const [domainSearchQuery, setDomainSearchQuery] = useState("");
  const [networkSearchQuery, setNetworkSearchQuery] = useState(
    networkName || "",
  );
  const [formData, setFormData] = useState<NetworkFormData>({
    name: "",
    ipv4_cidr: "",
    ipv6_cidr: "",
    domain_id: "",
  });

  const shortenUUID = (uuid: string) => {
    // Show first 8 characters of UUID
    return uuid.slice(0, 8);
  };

  const networksQuery = useQuery(trpc.getNetworks.queryOptions());
  const domainsQuery = useQuery(trpc.getDomains.queryOptions());

  // Filter networks based on domain and network name search
  const filteredNetworks = useMemo(() => {
    if (!networksQuery.data) return [];

    let filtered = networksQuery.data as NetworkWithDomain[];

    // Filter by network name
    if (networkSearchQuery.trim()) {
      const networkLower = networkSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((network) =>
        network.name.toLowerCase().includes(networkLower),
      );
    }

    // Filter by domain
    if (domainSearchQuery.trim()) {
      const domainLower = domainSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((network) => {
        const domainName = network.domain?.name?.toLowerCase() || "";
        const domainDisplayName =
          network.domain?.display_name?.toLowerCase() || "";
        return (
          domainName.includes(domainLower) ||
          domainDisplayName.includes(domainLower)
        );
      });
    }

    return filtered;
  }, [networksQuery.data, networkSearchQuery, domainSearchQuery]);

  const createNetworkMutation = useMutation({
    ...trpc.createNetwork.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.getNetworks.queryKey(),
      });
      setIsCreateDialogOpen(false);
      setFormData({ name: "", ipv4_cidr: "", ipv6_cidr: "", domain_id: "" });
      toast.success(
        t("networks.createSuccess") ?? "Network created successfully",
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateNetworkMutation = useMutation({
    ...trpc.updateNetwork.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.getNetworks.queryKey(),
      });
      setIsEditDialogOpen(false);
      setSelectedNetwork(null);
      setFormData({ name: "", ipv4_cidr: "", ipv6_cidr: "", domain_id: "" });
      toast.success(
        t("networks.updateSuccess") ?? "Network updated successfully",
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteNetworkMutation = useMutation({
    ...trpc.deleteNetwork.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.getNetworks.queryKey(),
      });
      setIsDeleteDialogOpen(false);
      setSelectedNetwork(null);
      toast.success(
        t("networks.deleteSuccess") ?? "Network deleted successfully",
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCreateClick = () => {
    const firstDomain = domainsQuery.data?.[0];
    setFormData({
      name: "",
      ipv4_cidr: "",
      ipv6_cidr: "",
      domain_id: firstDomain?.id || "",
    });
    setIsCreateDialogOpen(true);
  };

  const handleEditClick = (network: NetworkWithDomain) => {
    setSelectedNetwork(network);
    setFormData({
      name: network.name,
      ipv4_cidr: network.ipv4_cidr ?? "",
      ipv6_cidr: network.ipv6_cidr ?? "",
      domain_id: network.domain_id,
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = (network: NetworkWithDomain) => {
    setSelectedNetwork(network);
    setIsDeleteDialogOpen(true);
  };

  const handleCreateSubmit = () => {
    if (!formData.name) {
      toast.error("Please provide a network name");
      return;
    }
    if (!formData.domain_id) {
      toast.error("Please select a domain");
      return;
    }
    createNetworkMutation.mutate({
      name: formData.name,
      domain_id: formData.domain_id,
      ipv4_cidr: formData.ipv4_cidr || undefined,
      ipv6_cidr: formData.ipv6_cidr || undefined,
    });
  };

  const handleEditSubmit = () => {
    if (!selectedNetwork || !formData.name) {
      toast.error("Please provide a network name");
      return;
    }
    // Only update the network name - CIDR fields cannot be changed
    updateNetworkMutation.mutate({
      id: selectedNetwork.id,
      name: formData.name,
    });
  };

  const handleDeleteConfirm = () => {
    if (!selectedNetwork) return;
    deleteNetworkMutation.mutate({ id: selectedNetwork.id });
  };

  if (networksQuery.isLoading || domainsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
        <span className="ml-2">{t("common.loading")}</span>
      </div>
    );
  }

  if (networksQuery.error) {
    return (
      <ErrorDisplay
        error={
          networksQuery.error instanceof Error
            ? networksQuery.error
            : new Error("Failed to load networks")
        }
      />
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-7xl">
        {/* Search Boxes and Create Button */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex gap-3">
            {/* Network Name Search */}
            <div className="relative w-64">
              <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Filter by network name..."
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
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Domain Search */}
            <div className="relative w-64">
              <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                type="text"
                placeholder={
                  t("networks.filterByDomain") || "Filter by domain name..."
                }
                value={domainSearchQuery}
                onChange={(e) => setDomainSearchQuery(e.target.value)}
                className="pl-9"
              />
              {domainSearchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2"
                  onClick={() => setDomainSearchQuery("")}
                >
                  <X className="h-4 w-4" />
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
                <Plus className="mr-2 h-4 w-4" />
                {t("networks.createNetwork")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("networks.createNetwork")}</DialogTitle>
                <DialogDescription>
                  {t("networks.createDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="create-domain" className="text-right">
                    {t("domains.domain")}
                  </Label>
                  <select
                    id="create-domain"
                    value={formData.domain_id}
                    onChange={(e) =>
                      setFormData({ ...formData, domain_id: e.target.value })
                    }
                    className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring col-span-3 flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select a domain</option>
                    {domainsQuery.data?.map((domain) => (
                      <option key={domain.id} value={domain.id}>
                        {domain.display_name} ({domain.name})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="create-name" className="text-right">
                    {t("networks.name")}
                  </Label>
                  <Input
                    id="create-name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder={t("networks.namePlaceholder")}
                    className="col-span-3"
                  />
                </div>

                {/* Warning about CIDR immutability */}
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 text-amber-600 dark:text-amber-400">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                        Important: Network ranges cannot be changed
                      </h3>
                      <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                        Once created, IPv4 and IPv6 CIDR ranges cannot be
                        modified. Please ensure the network configuration is
                        correct before creating.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="create-ipv4" className="text-right">
                    {t("networks.ipv4Cidr")}
                  </Label>
                  <Input
                    id="create-ipv4"
                    value={formData.ipv4_cidr}
                    onChange={(e) =>
                      setFormData({ ...formData, ipv4_cidr: e.target.value })
                    }
                    placeholder="10.0.0.0/24"
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="create-ipv6" className="text-right">
                    {t("networks.ipv6Cidr")}
                  </Label>
                  <Input
                    id="create-ipv6"
                    value={formData.ipv6_cidr}
                    onChange={(e) =>
                      setFormData({ ...formData, ipv6_cidr: e.target.value })
                    }
                    placeholder="2001:db8::/32"
                    className="col-span-3"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  onClick={handleCreateSubmit}
                  disabled={createNetworkMutation.isPending}
                >
                  {createNetworkMutation.isPending ? (
                    <LoadingSpinner />
                  ) : (
                    t("buttons.save")
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Display filter info */}
        {(networkSearchQuery || domainSearchQuery) && (
          <div className="text-muted-foreground mb-4 text-sm">
            Showing {filteredNetworks.length} of{" "}
            {networksQuery.data?.length || 0} networks
            {filteredNetworks.length === 0 && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                No networks found matching your filters
              </span>
            )}
          </div>
        )}

        <div className="border-border bg-card overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("networks.name")}</TableHead>
                <TableHead>Network ID</TableHead>
                <TableHead>{t("domains.domain")}</TableHead>
                <TableHead>{t("networks.ipv4Cidr")}</TableHead>
                <TableHead>{t("networks.ipv6Cidr")}</TableHead>
                <TableHead>{t("common.createdAt")}</TableHead>
                <TableHead className="text-right">
                  {t("common.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredNetworks.map((network) => (
                <TableRow key={network.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">
                    <Link
                      to="/devices"
                      search={{ networkName: network.name }}
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {network.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-muted-foreground hover:text-foreground cursor-help font-mono text-sm transition-colors">
                          {shortenUUID(network.id)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-mono text-xs">{network.id}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {(network as NetworkWithDomain).domain ? (
                      <Link
                        to="/domains/$id"
                        params={{
                          id: (network as NetworkWithDomain).domain!.id,
                        }}
                        className="inline-block transition-opacity hover:opacity-70"
                      >
                        <Badge
                          variant="outline"
                          className="cursor-pointer font-mono"
                        >
                          {(network as NetworkWithDomain).domain?.display_name}
                        </Badge>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">
                    {network.ipv4_cidr ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">
                    {network.ipv6_cidr ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(network.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" asChild>
                            <Link
                              to="/debug/network-jobs"
                              search={{ networkName: network.name }}
                            >
                              <Bug className="h-4 w-4" />
                              <span className="sr-only">
                                Debug {network.name}
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
                            onClick={() =>
                              handleEditClick(network as NetworkWithDomain)
                            }
                            disabled={
                              updateNetworkMutation.isPending ||
                              deleteNetworkMutation.isPending
                            }
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">
                              {t("networks.editNetwork")} {network.name}
                            </span>
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
                            onClick={() =>
                              handleDeleteClick(network as NetworkWithDomain)
                            }
                            disabled={
                              updateNetworkMutation.isPending ||
                              deleteNetworkMutation.isPending
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">
                              {t("networks.deleteNetwork")} {network.name}
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
              {filteredNetworks.length === 0 && !domainSearchQuery && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-muted-foreground py-8 text-center"
                  >
                    {t("networks.noNetworks")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("networks.editNetwork")}</DialogTitle>
            <DialogDescription>
              {t("networks.editDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-domain" className="text-right">
                {t("domains.domain")}
              </Label>
              <div className="col-span-3">
                <Badge variant="secondary" className="font-mono">
                  {selectedNetwork?.domain?.display_name || "—"}
                </Badge>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="text-right">
                {t("networks.name")}
              </Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t("networks.namePlaceholder")}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-ipv4" className="text-right">
                {t("networks.ipv4Cidr")}
              </Label>
              <div className="col-span-3">
                <Input
                  id="edit-ipv4"
                  value={formData.ipv4_cidr}
                  placeholder="10.0.0.0/24"
                  disabled
                  className="cursor-not-allowed opacity-60"
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  Network CIDR cannot be changed after creation
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-ipv6" className="text-right">
                {t("networks.ipv6Cidr")}
              </Label>
              <div className="col-span-3">
                <Input
                  id="edit-ipv6"
                  value={formData.ipv6_cidr}
                  placeholder="2001:db8::/32"
                  disabled
                  className="cursor-not-allowed opacity-60"
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  Network CIDR cannot be changed after creation
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              onClick={handleEditSubmit}
              disabled={updateNetworkMutation.isPending}
            >
              {updateNetworkMutation.isPending ? (
                <LoadingSpinner />
              ) : (
                t("buttons.save")
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
            <AlertDialogTitle>{t("networks.deleteNetwork")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("networks.confirmDelete")} "{selectedNetwork?.name}"?
              {t("common.cannotUndo")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("buttons.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteNetworkMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteNetworkMutation.isPending ? (
                <LoadingSpinner />
              ) : (
                t("buttons.delete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
