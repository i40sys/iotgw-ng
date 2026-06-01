import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import type { Domain } from "@iotgw/supabase-contract";
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
import { Pencil, Trash2, Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  // Filter domains based on search query
  const filteredDomains = useMemo(() => {
    if (!domainsQuery.data) return [];
    if (!filterQuery.trim()) return domainsQuery.data;

    const searchLower = filterQuery.toLowerCase().trim();
    return domainsQuery.data.filter((domain) => {
      const domainName = domain.name.toLowerCase();
      const domainDisplayName = domain.display_name.toLowerCase();
      return (
        domainName.includes(searchLower) ||
        domainDisplayName.includes(searchLower)
      );
    });
  }, [domainsQuery.data, filterQuery]);

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

  return (
    <DomainErrorBoundary>
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-7xl">
          {/* Filter Section (left) and Create Button (right) - Same Row */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="relative max-w-md">
              <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Filter domains by name..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="pl-9"
              />
              {filterQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2"
                  onClick={() => setFilterQuery("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Dialog
              open={isCreateDialogOpen}
              onOpenChange={setIsCreateDialogOpen}
            >
              <DialogTrigger asChild>
                <Button onClick={handleCreateClick}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("domains.createDomain")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("domains.createDomain")}</DialogTitle>
                  <DialogDescription>
                    Create a new domain with a unique name and display name.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="create-name" className="text-right">
                      {t("domains.name")}
                    </Label>
                    <Input
                      id="create-name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder={t("domains.namePlaceholder")}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="create-display-name" className="text-right">
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
                      className="col-span-3"
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

          {/* Display filter info */}
          {filterQuery && (
            <div className="text-muted-foreground mb-4 text-sm">
              Showing {filteredDomains.length} of{" "}
              {domainsQuery.data?.length || 0} domains
              {filteredDomains.length === 0 && (
                <span className="ml-2 text-amber-600 dark:text-amber-400">
                  No domains found matching "{filterQuery}"
                </span>
              )}
            </div>
          )}

          <div className="border-border bg-card overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("domains.name")}</TableHead>
                  <TableHead>{t("domains.displayName")}</TableHead>
                  <TableHead>Networks</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDomains.map((domain) => (
                  <TableRow key={domain.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/domains/$id"
                        params={{ id: domain.id }}
                        className="hover:text-primary hover:underline"
                      >
                        {domain.name}
                      </Link>
                    </TableCell>
                    <TableCell>{domain.display_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">
                        {networkCountsQuery.data?.[domain.id] ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(domain.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditClick(domain)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(domain)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredDomains.length === 0 && !filterQuery && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-muted-foreground text-center"
                    >
                      {t("domains.noDomains")}
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
              <DialogTitle>{t("domains.editDomain")}</DialogTitle>
              <DialogDescription>
                Update the domain name and display name.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-name" className="text-right">
                  {t("domains.name")}
                </Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder={t("domains.namePlaceholder")}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-display-name" className="text-right">
                  {t("domains.displayName")}
                </Label>
                <Input
                  id="edit-display-name"
                  value={formData.display_name}
                  onChange={(e) =>
                    setFormData({ ...formData, display_name: e.target.value })
                  }
                  placeholder={t("domains.displayNamePlaceholder")}
                  className="col-span-3"
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
          <AlertDialogContent>
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
