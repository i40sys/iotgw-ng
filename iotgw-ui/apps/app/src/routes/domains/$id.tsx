import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ErrorDisplay } from "@/components/ui/error-display";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { DomainForm, DomainErrorBoundary } from "@/components/domains";
import {
  NetworkList,
  CreateNetworkDialog,
  EditNetworkDialog,
} from "@/components/networks";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useDomainErrorHandling } from "@/hooks/use-domain-validation";
import { useNetworkOperations } from "@/hooks/use-network-operations";
import type { UpdateDomainInput, Network } from "@iotgw/supabase-contract";

export const Route = createFileRoute("/domains/$id")({
  parseParams: (params) => ({
    id: params.id,
  }),
  loader: async ({ context, params }) => {
    const { queryClient, trpc } = context;
    const domainId = params.id;

    console.log("Loading domain detail for ID:", domainId);

    try {
      await queryClient.ensureQueryData(
        trpc.getDomain.queryOptions({ id: domainId }),
      );
      console.log("Domain data loaded successfully");
      return {};
    } catch (error) {
      console.error("Failed to load domain:", error);
      throw new Error(`Domain with ID ${domainId} not found`);
    }
  },
  errorComponent: ({ error }) => (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Link to="/domains">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Domains
          </Button>
        </Link>
      </div>
      <ErrorDisplay
        error={error instanceof Error ? error : new Error("Unknown error")}
      />
    </div>
  ),
  pendingComponent: () => (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Link to="/domains">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Domains
          </Button>
        </Link>
      </div>
      <LoadingSpinner />
    </div>
  ),
  component: DomainDetailPage,
});

function DomainDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: domainId } = Route.useParams();
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { getErrorMessage } = useDomainErrorHandling();

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<Network | null>(null);

  const domainQuery = useQuery(trpc.getDomain.queryOptions({ id: domainId }));
  const {
    networks,
    isLoading: isNetworksLoading,
    isError: isNetworksError,
    errorMessage: networksErrorMessage,
    deleteNetwork,
    isDeleting,
  } = useNetworkOperations(domainId);

  const updateDomainMutation = useMutation({
    ...trpc.updateDomain.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.getDomains.queryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.getDomain.queryKey({ id: domainId }),
      });
      setIsEditDialogOpen(false);
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
      toast.success(
        t("domains.deleteSuccess") ?? "Domain deleted successfully",
      );
      void navigate({ to: "/domains" });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const handleEditClick = () => {
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleEditSubmit = (data: UpdateDomainInput) => {
    updateDomainMutation.mutate(data);
  };

  const handleDeleteConfirm = () => {
    deleteDomainMutation.mutate({ id: domainId });
  };

  const handleEditNetwork = (network: Network) => {
    setSelectedNetwork(network);
  };

  const handleDeleteNetwork = (network: Network) => {
    deleteNetwork({ id: network.id });
  };

  const domain = domainQuery.data;

  if (!domain) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <Link to="/domains">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Domains
            </Button>
          </Link>
        </div>
        <div className="text-muted-foreground py-8 text-center">
          Domain not found
        </div>
      </div>
    );
  }

  return (
    <DomainErrorBoundary>
      <div className="flex flex-col gap-6 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/domains">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Domains
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">{domain.display_name}</h1>
              <p className="text-muted-foreground">{domain.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleEditClick}>
              <Pencil className="mr-2 h-4 w-4" />
              {t("domains.editDomain")}
            </Button>
            <Button variant="outline" onClick={handleDeleteClick}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t("domains.deleteDomain")}
            </Button>
          </div>
        </div>

        {/* Domain Details */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Basic Information */}
          <div className="rounded-lg border p-6">
            <h2 className="mb-4 text-lg font-semibold">Basic Information</h2>
            <dl className="space-y-4">
              <div>
                <dt className="text-muted-foreground text-sm font-medium">
                  {t("domains.name")}
                </dt>
                <dd className="bg-muted rounded px-2 py-1 font-mono text-sm">
                  {domain.name}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm font-medium">
                  {t("domains.displayName")}
                </dt>
                <dd className="text-sm">{domain.display_name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm font-medium">
                  Domain ID
                </dt>
                <dd className="bg-muted rounded px-2 py-1 font-mono text-sm text-xs">
                  {domain.id}
                </dd>
              </div>
            </dl>
          </div>

          {/* Timestamps */}
          <div className="rounded-lg border p-6">
            <h2 className="mb-4 text-lg font-semibold">Timestamps</h2>
            <dl className="space-y-4">
              <div>
                <dt className="text-muted-foreground text-sm font-medium">
                  Created At
                </dt>
                <dd className="text-sm">
                  {new Date(domain.created_at).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm font-medium">
                  Updated At
                </dt>
                <dd className="text-sm">
                  {new Date(domain.updated_at).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Networks Section */}
        <div className="rounded-lg border p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Networks</h2>
              <p className="text-muted-foreground text-sm">
                Manage networks associated with this domain
                {networks.length > 0 && ` (${networks.length})`}
              </p>
            </div>
            <CreateNetworkDialog domainId={domainId} />
          </div>

          {isNetworksError ? (
            <div className="text-destructive py-8 text-center">
              <p>{networksErrorMessage ?? "Failed to load networks"}</p>
            </div>
          ) : (
            <NetworkList
              networks={networks}
              onEdit={handleEditNetwork}
              onDelete={handleDeleteNetwork}
              isLoading={isNetworksLoading}
              isDeleting={isDeleting}
            />
          )}
        </div>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{t("domains.editDomain")}</DialogTitle>
              <DialogDescription>
                Make changes to the domain information below.
              </DialogDescription>
            </DialogHeader>
            <DomainForm
              mode="edit"
              initialData={domain}
              onSubmit={handleEditSubmit}
              onCancel={() => setIsEditDialogOpen(false)}
              isSubmitting={updateDomainMutation.isPending}
              submitError={updateDomainMutation.error?.message ?? null}
            />
          </DialogContent>
        </Dialog>

        {/* Edit Network Dialog */}
        {selectedNetwork && (
          <EditNetworkDialog
            network={selectedNetwork}
            onSuccess={() => {
              setSelectedNetwork(null);
            }}
          />
        )}

        {/* Delete Dialog */}
        <AlertDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("domains.deleteDomain")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("domains.confirmDelete")} "{domain.display_name}"? This
                action cannot be undone and will permanently delete the domain.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("buttons.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                disabled={deleteDomainMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteDomainMutation.isPending ? (
                  <>
                    <LoadingSpinner />
                    <span className="ml-2">Deleting...</span>
                  </>
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
