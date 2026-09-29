import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import { z } from "zod";
import type { Network } from "@iotgw/supabase-contract";
import { ErrorDisplay } from "@/components/ui/error-display";
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
  ListChecks,
  Network as NetworkIcon,
} from "lucide-react";
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
    networkName ?? "",
  );
  const [formData, setFormData] = useState<NetworkFormData>({
    name: "",
    ipv4_cidr: "",
    ipv6_cidr: "",
    domain_id: "",
  });

  const networksQuery = useQuery(trpc.getNetworks.queryOptions());
  const domainsQuery = useQuery(trpc.getDomains.queryOptions());

  const filteredNetworks = useMemo(
    () =>
      ((networksQuery.data ?? []) as NetworkWithDomain[]).filter(
        (network) =>
          matchesInventorySearch(
            networkSearchQuery,
            network.name,
            network.id,
            network.ipv4_cidr,
            network.ipv6_cidr,
          ) &&
          matchesInventorySearch(
            domainSearchQuery,
            network.domain?.name,
            network.domain?.display_name,
            network.domain_id,
          ),
      ),
    [networksQuery.data, networkSearchQuery, domainSearchQuery],
  );

  const sortAccessors = useMemo(
    () => ({
      name: (n: (typeof filteredNetworks)[number]) => n.name,
      id: (n: (typeof filteredNetworks)[number]) => n.id,
      domain: (n: (typeof filteredNetworks)[number]) => n.domain?.name,
      ipv4: (n: (typeof filteredNetworks)[number]) =>
        ipSortValue(n.ipv4_cidr?.split("/")[0]),
      ipv6: (n: (typeof filteredNetworks)[number]) => n.ipv6_cidr,
      created: (n: (typeof filteredNetworks)[number]) =>
        n.created_at ? new Date(n.created_at).getTime() : null,
    }),
    [],
  );
  const {
    sort,
    setSort,
    toggleSort,
    sortedRows: sortedNetworks,
  } = useTableSort(filteredNetworks, sortAccessors);

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
      domain_id: firstDomain?.id ?? "",
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
      ipv4_cidr: formData.ipv4_cidr === "" ? undefined : formData.ipv4_cidr,
      ipv6_cidr: formData.ipv6_cidr === "" ? undefined : formData.ipv6_cidr,
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

  const columns: InventoryColumn<
    NetworkWithDomain,
    keyof typeof sortAccessors
  >[] = [
    {
      key: "network",
      label: t("networks.network"),
      sortKey: "name",
      render: (network) => (
        <div className="space-y-1.5">
          <Link
            to="/devices"
            search={{ networkName: network.name }}
            className="text-primary font-semibold hover:underline"
          >
            {network.name}
          </Link>
          <p className="text-muted-foreground font-mono text-xs">
            {network.id}
          </p>
        </div>
      ),
    },
    {
      key: "domain",
      label: t("domains.domain"),
      sortKey: "domain",
      className: "w-[22%]",
      render: (network) =>
        network.domain ? (
          <div className="space-y-1.5">
            <Link
              to="/domains/$id"
              params={{ id: network.domain.id }}
              className="text-primary font-medium hover:underline"
            >
              {network.domain.display_name}
            </Link>
            <p className="text-muted-foreground text-xs">
              {network.domain.name}
            </p>
          </div>
        ) : (
          <span className="text-muted-foreground">
            {t("inventory.notAvailable")}
          </span>
        ),
    },
    {
      key: "addresses",
      label: t("inventory.addressRanges"),
      sortKey: "ipv4",
      className: "w-[24%]",
      render: (network) => (
        <dl className="space-y-2 text-xs">
          <div>
            <dt className="text-muted-foreground">IPv4</dt>
            <dd className="mt-1 font-mono">
              {network.ipv4_cidr ?? t("inventory.notAssigned")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">IPv6</dt>
            <dd className="mt-1 font-mono">
              {network.ipv6_cidr ?? t("inventory.notAssigned")}
            </dd>
          </div>
        </dl>
      ),
    },
    {
      key: "created",
      label: t("inventory.created"),
      sortKey: "created",
      className: "w-32",
      render: (network) => <InventoryDate value={network.created_at} />,
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="@container mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("networks.title")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("networks.description")}
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
                <Plus className="mr-2 h-4 w-4" />
                {t("networks.createNetwork")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto [overflow-wrap:anywhere]">
              <DialogHeader>
                <DialogTitle>{t("networks.createNetwork")}</DialogTitle>
                <DialogDescription>
                  {t("networks.createDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label htmlFor="create-domain" className="sm:text-right">
                    {t("domains.domain")}
                  </Label>
                  <select
                    id="create-domain"
                    value={formData.domain_id}
                    onChange={(e) =>
                      setFormData({ ...formData, domain_id: e.target.value })
                    }
                    className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full min-w-0 rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-3"
                  >
                    <option value="">{t("domains.selectDomain")}</option>
                    {domainsQuery.data?.map((domain) => (
                      <option key={domain.id} value={domain.id}>
                        {domain.display_name} ({domain.name})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label htmlFor="create-name" className="sm:text-right">
                    {t("networks.name")}
                  </Label>
                  <Input
                    id="create-name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder={t("networks.namePlaceholder")}
                    className="min-w-0 sm:col-span-3"
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
                        {t("inventory.immutableRangesTitle")}
                      </h3>
                      <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                        {t("inventory.immutableRangesDescription")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label htmlFor="create-ipv4" className="sm:text-right">
                    {t("networks.ipv4Cidr")}
                  </Label>
                  <Input
                    id="create-ipv4"
                    value={formData.ipv4_cidr}
                    onChange={(e) =>
                      setFormData({ ...formData, ipv4_cidr: e.target.value })
                    }
                    placeholder="10.0.0.0/24"
                    className="min-w-0 sm:col-span-3"
                  />
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                  <Label htmlFor="create-ipv6" className="sm:text-right">
                    {t("networks.ipv6Cidr")}
                  </Label>
                  <Input
                    id="create-ipv6"
                    value={formData.ipv6_cidr}
                    onChange={(e) =>
                      setFormData({ ...formData, ipv6_cidr: e.target.value })
                    }
                    placeholder="2001:db8::/32"
                    className="min-w-0 sm:col-span-3"
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
        <section
          className="bg-card overflow-hidden rounded-lg border"
          aria-label={t("networks.title")}
        >
          <InventoryToolbar
            searches={[
              {
                label: t("inventory.searchNetworks"),
                placeholder: t("inventory.networkSearchPlaceholder"),
                value: networkSearchQuery,
                onChange: setNetworkSearchQuery,
              },
              {
                label: t("inventory.filterDomain"),
                placeholder: t("inventory.domainFilterPlaceholder"),
                value: domainSearchQuery,
                onChange: setDomainSearchQuery,
              },
            ]}
            sort={sort}
            onSortChange={setSort}
            sortOptions={[
              { key: "name", label: t("networks.name") },
              { key: "id", label: t("inventory.networkId") },
              { key: "domain", label: t("domains.domain") },
              { key: "ipv4", label: t("networks.ipv4Cidr") },
              { key: "ipv6", label: t("networks.ipv6Cidr") },
              { key: "created", label: t("inventory.created") },
            ]}
            count={filteredNetworks.length}
            total={networksQuery.data?.length ?? 0}
            onRefresh={() => {
              void networksQuery.refetch();
              void domainsQuery.refetch();
            }}
            isRefreshing={networksQuery.isFetching || domainsQuery.isFetching}
          />
          <InventoryList
            rows={sortedNetworks}
            columns={columns}
            sort={sort}
            onSort={toggleSort}
            label={t("networks.title")}
            emptyMessage={
              networkSearchQuery.trim() || domainSearchQuery.trim()
                ? t("inventory.noMatches")
                : t("networks.noNetworks")
            }
            actions={(network) => (
              <InventoryActions
                name={network.name}
                disabled={
                  updateNetworkMutation.isPending ||
                  deleteNetworkMutation.isPending
                }
                primary={
                  <Button variant="secondary" size="sm" asChild>
                    <Link to="/devices" search={{ networkName: network.name }}>
                      <NetworkIcon aria-hidden="true" className="size-4" />
                      {t("devices.title")}
                    </Link>
                  </Button>
                }
              >
                <DropdownMenuItem asChild>
                  <Link
                    to="/debug/network-jobs"
                    search={{ networkName: network.name }}
                  >
                    <ListChecks aria-hidden="true" />
                    {t("inventory.viewJobs")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => handleEditClick(network)}>
                  <Pencil aria-hidden="true" />
                  {t("networks.editNetwork")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => handleDeleteClick(network)}
                >
                  <Trash2 aria-hidden="true" />
                  {t("networks.deleteNetwork")}
                </DropdownMenuItem>
              </InventoryActions>
            )}
          />
        </section>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto [overflow-wrap:anywhere]">
          <DialogHeader>
            <DialogTitle>{t("networks.editNetwork")}</DialogTitle>
            <DialogDescription>
              {t("networks.editDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="edit-domain" className="sm:text-right">
                {t("domains.domain")}
              </Label>
              <div className="min-w-0 sm:col-span-3">
                <Badge
                  variant="secondary"
                  className="max-w-full font-mono [overflow-wrap:anywhere] whitespace-normal"
                >
                  {selectedNetwork?.domain?.display_name ?? "—"}
                </Badge>
              </div>
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="edit-name" className="sm:text-right">
                {t("networks.name")}
              </Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t("networks.namePlaceholder")}
                className="min-w-0 sm:col-span-3"
              />
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="edit-ipv4" className="sm:text-right">
                {t("networks.ipv4Cidr")}
              </Label>
              <div className="min-w-0 sm:col-span-3">
                <Input
                  id="edit-ipv4"
                  value={formData.ipv4_cidr}
                  placeholder="10.0.0.0/24"
                  disabled
                  className="cursor-not-allowed opacity-60"
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  {t("inventory.immutableRange")}
                </p>
              </div>
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="edit-ipv6" className="sm:text-right">
                {t("networks.ipv6Cidr")}
              </Label>
              <div className="min-w-0 sm:col-span-3">
                <Input
                  id="edit-ipv6"
                  value={formData.ipv6_cidr}
                  placeholder="2001:db8::/32"
                  disabled
                  className="cursor-not-allowed opacity-60"
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  {t("inventory.immutableRange")}
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
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto [overflow-wrap:anywhere]">
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
