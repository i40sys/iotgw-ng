import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import type { Tables } from "@iotgw/supabase-contract";
import { ErrorDisplay } from "@/components/ui/error-display";
import {
  InventoryActions,
  InventoryDate,
  InventoryList,
  InventoryToolbar,
  type InventoryColumn,
} from "@/components/inventory-list";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { matchesInventorySearch } from "@/lib/inventory";
import { useTableSort } from "@/hooks/use-table-sort";
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
import { Pencil, Trash2, Plus, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DomainErrorBoundary } from "@/components/domains";
import { useDomainErrorHandling } from "@/hooks/use-domain-validation";

export const Route = createFileRoute("/domains/")({
  loader: async ({ context }) => {
    console.log("[DomainsRoute] Loader executing");
    const { queryClient, trpc } = context;
    console.log("[DomainsRoute] Context available:", {
      queryClient: !!queryClient,
      trpc: !!trpc,
    });

    try {
      await queryClient.ensureQueryData(trpc.getDomains.queryOptions());
      console.log("[DomainsRoute] Loader successfully ensured domains data");
    } catch (error) {
      console.error("[DomainsRoute] Loader error:", error);
      throw error;
    }

    return {};
  },
  errorComponent: ({ error }) => (
    <ErrorDisplay
      error={error instanceof Error ? error : new Error("Unknown error")}
    />
  ),
  pendingComponent: () => <LoadingSpinner />,
  component: DomainsPage,
});

type Domain = Tables<"domains">;

interface DomainFormData {
  name: string;
  display_name: string;
}

function DomainsPage() {
  const { t } = useTranslation();
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { getErrorMessage } = useDomainErrorHandling();

  // Debug logging
  console.log("[DomainsPage] Component mounting");
  console.log("[DomainsPage] tRPC context available:", !!trpc);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [formData, setFormData] = useState<DomainFormData>({
    name: "",
    display_name: "",
  });

  const domainsQuery = useQuery(trpc.getDomains.queryOptions());
  const networkCountsQuery = useQuery(trpc.getNetworkCounts.queryOptions());

  const filteredDomains = useMemo(
    () =>
      (domainsQuery.data ?? []).filter((domain) =>
        matchesInventorySearch(
          filterQuery,
          domain.name,
          domain.display_name,
          domain.id,
        ),
      ),
    [domainsQuery.data, filterQuery],
  );

  const sortAccessors = useMemo(
    () => ({
      name: (d: (typeof filteredDomains)[number]) => d.name,
      displayName: (d: (typeof filteredDomains)[number]) => d.display_name,
      networks: (d: (typeof filteredDomains)[number]) =>
        networkCountsQuery.data?.[d.id] ?? 0,
      created: (d: (typeof filteredDomains)[number]) =>
        d.created_at ? new Date(d.created_at).getTime() : null,
    }),
    [networkCountsQuery.data],
  );
  const {
    sort,
    setSort,
    toggleSort,
    sortedRows: sortedDomains,
  } = useTableSort(filteredDomains, sortAccessors);

  // Debug query states
  console.log("[DomainsPage] Domains query status:", domainsQuery.status);
  console.log("[DomainsPage] Domains query error:", domainsQuery.error);
  console.log(
    "[DomainsPage] Network counts query status:",
    networkCountsQuery.status,
  );
  console.log(
    "[DomainsPage] Network counts query error:",
    networkCountsQuery.error,
  );

  const createDomainMutation = useMutation({
    ...trpc.createDomain.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.getDomains.queryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.getNetworkCounts.queryKey(),
      });
      setIsCreateDialogOpen(false);
      setFormData({ name: "", display_name: "" });
      toast.success(
        t("domains.createSuccess") ?? "Domain created successfully",
      );
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const updateDomainMutation = useMutation({
    ...trpc.updateDomain.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.getDomains.queryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.getNetworkCounts.queryKey(),
      });
      setIsEditDialogOpen(false);
      setSelectedDomain(null);
      setFormData({ name: "", display_name: "" });
      toast.success(
        t("domains.updateSuccess") ?? "Domain updated successfully",
      );
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const deleteDomainMutation = useMutation({
    ...trpc.deleteDomain.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.getDomains.queryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.getNetworkCounts.queryKey(),
      });
      setIsDeleteDialogOpen(false);
      setSelectedDomain(null);
      toast.success(
        t("domains.deleteSuccess") ?? "Domain deleted successfully",
      );
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const handleCreateClick = () => {
    setFormData({ name: "", display_name: "" });
    setIsCreateDialogOpen(true);
  };

  const handleEditClick = (domain: Domain) => {
    setSelectedDomain(domain);
    setFormData({ name: domain.name, display_name: domain.display_name });
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = (domain: Domain) => {
    setSelectedDomain(domain);
    setIsDeleteDialogOpen(true);
  };

  const handleCreateSubmit = () => {
    if (!formData.name || !formData.display_name) {
      toast.error("Please fill in all fields");
      return;
    }
    createDomainMutation.mutate({
      name: formData.name,
      display_name: formData.display_name,
    });
  };

  const handleEditSubmit = () => {
    if (!selectedDomain || !formData.name || !formData.display_name) {
      toast.error("Please fill in all fields");
      return;
    }
    updateDomainMutation.mutate({
      id: selectedDomain.id,
      name: formData.name,
      display_name: formData.display_name,
    });
  };

  const handleDeleteConfirm = () => {
    if (!selectedDomain) return;
    deleteDomainMutation.mutate({ id: selectedDomain.id });
  };

  const columns: InventoryColumn<Domain, keyof typeof sortAccessors>[] = [
    {
      key: "domain",
      label: t("domains.domain"),
      sortKey: "name",
      render: (domain) => (
        <div className="space-y-1.5">
          <Link
            to="/domains/$id"
            params={{ id: domain.id }}
            className="text-primary font-semibold hover:underline"
          >
            {domain.name}
          </Link>
          <p className="text-sm">{domain.display_name}</p>
          <p className="text-muted-foreground font-mono text-xs">{domain.id}</p>
        </div>
      ),
    },
    {
      key: "networks",
      label: t("networks.title"),
      sortKey: "networks",
      className: "w-32",
      render: (domain) => (
        <Badge variant="secondary" className="font-mono">
          {networkCountsQuery.data?.[domain.id] ?? 0}
        </Badge>
      ),
    },
    {
      key: "created",
      label: t("inventory.created"),
      sortKey: "created",
      className: "w-40",
      render: (domain) => <InventoryDate value={domain.created_at} />,
    },
  ];

  return (
    <DomainErrorBoundary>
      <div className="container mx-auto px-4 py-8">
        <div className="@container mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                {t("domains.title")}
              </h1>
              <p className="text-muted-foreground text-sm">
                {t("domains.description")}
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
                  {t("domains.createDomain")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90dvh] overflow-y-auto [overflow-wrap:anywhere]">
                <DialogHeader>
                  <DialogTitle>{t("domains.createDomain")}</DialogTitle>
                  <DialogDescription>
                    {t("inventory.createDomainDescription")}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                    <Label htmlFor="create-name" className="sm:text-right">
                      {t("domains.name")}
                    </Label>
                    <Input
                      id="create-name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder={t("domains.namePlaceholder")}
                      className="min-w-0 sm:col-span-3"
                    />
                  </div>
                  <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                    <Label
                      htmlFor="create-display-name"
                      className="sm:text-right"
                    >
                      {t("domains.displayName")}
                    </Label>
                    <Input
                      id="create-display-name"
                      value={formData.display_name}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          display_name: e.target.value,
                        })
                      }
                      placeholder={t("domains.displayNamePlaceholder")}
                      className="min-w-0 sm:col-span-3"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    onClick={handleCreateSubmit}
                    disabled={createDomainMutation.isPending}
                  >
                    {createDomainMutation.isPending ? (
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
            aria-label={t("domains.title")}
          >
            <InventoryToolbar
              searches={[
                {
                  label: t("inventory.searchDomains"),
                  placeholder: t("inventory.domainSearchPlaceholder"),
                  value: filterQuery,
                  onChange: setFilterQuery,
                },
              ]}
              sort={sort}
              onSortChange={setSort}
              sortOptions={[
                { key: "name", label: t("domains.name") },
                { key: "displayName", label: t("domains.displayName") },
                { key: "networks", label: t("networks.title") },
                { key: "created", label: t("inventory.created") },
              ]}
              count={filteredDomains.length}
              total={domainsQuery.data?.length ?? 0}
              onRefresh={() => {
                void domainsQuery.refetch();
                void networkCountsQuery.refetch();
              }}
              isRefreshing={
                domainsQuery.isFetching || networkCountsQuery.isFetching
              }
            />
            <InventoryList
              rows={sortedDomains}
              columns={columns}
              sort={sort}
              onSort={toggleSort}
              label={t("domains.title")}
              emptyMessage={
                filterQuery.trim()
                  ? t("inventory.noMatches")
                  : t("domains.noDomains")
              }
              actions={(domain) => (
                <InventoryActions
                  name={domain.name}
                  disabled={
                    updateDomainMutation.isPending ||
                    deleteDomainMutation.isPending
                  }
                  primary={
                    <Button variant="secondary" size="sm" asChild>
                      <Link to="/domains/$id" params={{ id: domain.id }}>
                        <ArrowRight aria-hidden="true" className="size-4" />
                        {t("inventory.details")}
                      </Link>
                    </Button>
                  }
                >
                  <DropdownMenuItem onSelect={() => handleEditClick(domain)}>
                    <Pencil aria-hidden="true" />
                    {t("domains.editDomain")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => handleDeleteClick(domain)}
                  >
                    <Trash2 aria-hidden="true" />
                    {t("domains.deleteDomain")}
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
              <DialogTitle>{t("domains.editDomain")}</DialogTitle>
              <DialogDescription>
                {t("inventory.editDomainDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                <Label htmlFor="edit-name" className="sm:text-right">
                  {t("domains.name")}
                </Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder={t("domains.namePlaceholder")}
                  className="min-w-0 sm:col-span-3"
                />
              </div>
              <div className="grid min-w-0 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                <Label htmlFor="edit-display-name" className="sm:text-right">
                  {t("domains.displayName")}
                </Label>
                <Input
                  id="edit-display-name"
                  value={formData.display_name}
                  onChange={(e) =>
                    setFormData({ ...formData, display_name: e.target.value })
                  }
                  placeholder={t("domains.displayNamePlaceholder")}
                  className="min-w-0 sm:col-span-3"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                onClick={handleEditSubmit}
                disabled={updateDomainMutation.isPending}
              >
                {updateDomainMutation.isPending ? (
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
              <AlertDialogTitle>{t("domains.deleteDomain")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("domains.confirmDelete")} "{selectedDomain?.display_name}"?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("buttons.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                disabled={deleteDomainMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleteDomainMutation.isPending ? (
                  <LoadingSpinner />
                ) : (
                  t("buttons.delete")
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DomainErrorBoundary>
  );
}
