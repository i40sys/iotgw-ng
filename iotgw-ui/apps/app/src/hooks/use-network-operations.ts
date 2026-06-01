import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type {
  Network,
  CreateNetworkInput,
  UpdateNetworkInput,
  NetworkIdInput,
} from "@iotgw/supabase-contract";
import { trpc } from "@/utils/trpc";
import { useNetworkErrorHandling } from "./use-network-validation";

/**
 * Hook for fetching networks by domain ID
 */
export function useNetworks(domainId: string) {
  const { getErrorMessage } = useNetworkErrorHandling();

  const query = useQuery({
    ...trpc.getNetworksByDomain.queryOptions({ domain_id: domainId }),
    enabled: !!domainId,
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
    retry: (failureCount, error) => {
      // Don't retry on 404 (domain not found) or 403 (unauthorized)
      if (
        (error as unknown as { code?: string })?.code === "NOT_FOUND" ||
        (error as unknown as { code?: string })?.code === "UNAUTHORIZED"
      ) {
        return false;
      }
      return failureCount < 3;
    },
  });

  return {
    networks: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    errorMessage: query.error ? getErrorMessage(query.error) : null,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };
}

/**
 * Hook for creating a new network
 */
export function useCreateNetwork() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { getErrorMessage } = useNetworkErrorHandling();

  const mutation = useMutation({
    ...trpc.createNetwork.mutationOptions(),
    onMutate: async (newNetwork: CreateNetworkInput) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({
        queryKey: trpc.getNetworksByDomain.queryKey({
          domain_id: newNetwork.domain_id,
        }),
      });

      // Snapshot the previous value
      const previousNetworks = queryClient.getQueryData(
        trpc.getNetworksByDomain.queryKey({
          domain_id: newNetwork.domain_id,
        }),
      );

      // Optimistically update to the new value
      queryClient.setQueryData(
        trpc.getNetworksByDomain.queryKey({
          domain_id: newNetwork.domain_id,
        }),
        (old: Network[] = []) => {
          const optimisticNetwork: Network = {
            id: `temp-${Date.now()}`,
            domain_id: newNetwork.domain_id,
            name: newNetwork.name,
            cidr: newNetwork.cidr ?? null,
            ipv4: newNetwork.ipv4 ?? null,
            ipv6: newNetwork.ipv6 ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          return [optimisticNetwork, ...old];
        },
      );

      // Return a context with the previous and new values
      return { previousNetworks, newNetwork };
    },
    onError: (error, newNetwork, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousNetworks) {
        queryClient.setQueryData(
          trpc.getNetworksByDomain.queryKey({
            domain_id: newNetwork.domain_id,
          }),
          context.previousNetworks,
        );
      }
      toast.error(getErrorMessage(error));
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch networks for this domain
      void queryClient.invalidateQueries({
        queryKey: trpc.getNetworksByDomain.queryKey({
          domain_id: variables.domain_id,
        }),
      });

      // Also invalidate all networks query if it exists
      void queryClient.invalidateQueries({
        queryKey: trpc.getNetworks.queryKey(),
      });

      toast.success(
        t("networks.createSuccess") ?? "Network created successfully",
      );
    },
    onSettled: (data, error, variables) => {
      // Always refetch after error or success
      void queryClient.invalidateQueries({
        queryKey: trpc.getNetworksByDomain.queryKey({
          domain_id: variables.domain_id,
        }),
      });
    },
  });

  return {
    createNetwork: mutation.mutate,
    createNetworkAsync: mutation.mutateAsync,
    isCreating: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
    reset: mutation.reset,
  };
}

/**
 * Hook for updating an existing network
 */
export function useUpdateNetwork() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { getErrorMessage } = useNetworkErrorHandling();

  const mutation = useMutation({
    ...trpc.updateNetwork.mutationOptions(),
    onMutate: async (updatedNetwork: UpdateNetworkInput) => {
      // We need to get the current network to know which domain it belongs to
      const currentNetworks = queryClient.getQueryData<Network[]>(
        trpc.getNetworks.queryKey(),
      );

      const existingNetwork = currentNetworks?.find(
        (n) => n.id === updatedNetwork.id,
      );

      if (!existingNetwork) {
        return { previousNetworks: null };
      }

      const domainId = updatedNetwork.domain_id ?? existingNetwork.domain_id;

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: trpc.getNetworksByDomain.queryKey({
          domain_id: domainId,
        }),
      });

      // Snapshot the previous value
      const previousNetworks = queryClient.getQueryData(
        trpc.getNetworksByDomain.queryKey({
          domain_id: domainId,
        }),
      );

      // Optimistically update the network
      queryClient.setQueryData(
        trpc.getNetworksByDomain.queryKey({
          domain_id: domainId,
        }),
        (old: Network[] = []) => {
          return old.map((network) =>
            network.id === updatedNetwork.id
              ? {
                  ...network,
                  ...updatedNetwork,
                  updated_at: new Date().toISOString(),
                }
              : network,
          );
        },
      );

      return { previousNetworks, domainId };
    },
    onError: (error, updatedNetwork, context) => {
      // Roll back on error
      if (context?.previousNetworks && context.domainId) {
        queryClient.setQueryData(
          trpc.getNetworksByDomain.queryKey({
            domain_id: context.domainId,
          }),
          context.previousNetworks,
        );
      }
      toast.error(getErrorMessage(error));
    },
    onSuccess: (data) => {
      const domainId = data.domain_id;

      // Invalidate and refetch networks for this domain
      void queryClient.invalidateQueries({
        queryKey: trpc.getNetworksByDomain.queryKey({
          domain_id: domainId,
        }),
      });

      // Also invalidate all networks query if it exists
      void queryClient.invalidateQueries({
        queryKey: trpc.getNetworks.queryKey(),
      });

      toast.success(
        t("networks.updateSuccess") ?? "Network updated successfully",
      );
    },
    onSettled: (data, error, variables, context) => {
      // Always refetch after error or success
      if (context?.domainId) {
        void queryClient.invalidateQueries({
          queryKey: trpc.getNetworksByDomain.queryKey({
            domain_id: context.domainId,
          }),
        });
      }
    },
  });

  return {
    updateNetwork: mutation.mutate,
    updateNetworkAsync: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
    reset: mutation.reset,
  };
}

/**
 * Hook for deleting a network
 */
export function useDeleteNetwork() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { getErrorMessage } = useNetworkErrorHandling();

  const mutation = useMutation({
    ...trpc.deleteNetwork.mutationOptions(),
    onMutate: async (variables: NetworkIdInput) => {
      // Get the network to know which domain it belongs to
      const allNetworks = queryClient.getQueryData<Network[]>(
        trpc.getNetworks.queryKey(),
      );

      const networkToDelete = allNetworks?.find((n) => n.id === variables.id);

      if (!networkToDelete) {
        return { previousNetworks: null, domainId: null };
      }

      const domainId = networkToDelete.domain_id;

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: trpc.getNetworksByDomain.queryKey({
          domain_id: domainId,
        }),
      });

      // Snapshot the previous value
      const previousNetworks = queryClient.getQueryData(
        trpc.getNetworksByDomain.queryKey({
          domain_id: domainId,
        }),
      );

      // Optimistically remove the network
      queryClient.setQueryData(
        trpc.getNetworksByDomain.queryKey({
          domain_id: domainId,
        }),
        (old: Network[] = []) => {
          return old.filter((network) => network.id !== variables.id);
        },
      );

      return { previousNetworks, domainId, networkToDelete };
    },
    onError: (error, variables, context) => {
      // Roll back on error
      if (context?.previousNetworks && context.domainId) {
        queryClient.setQueryData(
          trpc.getNetworksByDomain.queryKey({
            domain_id: context.domainId,
          }),
          context.previousNetworks,
        );
      }
      toast.error(getErrorMessage(error));
    },
    onSuccess: (data, variables, context) => {
      if (context?.domainId) {
        // Invalidate and refetch networks for this domain
        void queryClient.invalidateQueries({
          queryKey: trpc.getNetworksByDomain.queryKey({
            domain_id: context.domainId,
          }),
        });
      }

      // Also invalidate all networks query if it exists
      void queryClient.invalidateQueries({
        queryKey: trpc.getNetworks.queryKey(),
      });

      toast.success(
        t("networks.deleteSuccess") ?? "Network deleted successfully",
      );
    },
    onSettled: (data, error, variables, context) => {
      // Always refetch after error or success
      if (context?.domainId) {
        void queryClient.invalidateQueries({
          queryKey: trpc.getNetworksByDomain.queryKey({
            domain_id: context.domainId,
          }),
        });
      }
    },
  });

  return {
    deleteNetwork: mutation.mutate,
    deleteNetworkAsync: mutation.mutateAsync,
    isDeleting: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
    reset: mutation.reset,
  };
}

/**
 * Composite hook for all network operations within a domain
 */
export function useNetworkOperations(domainId: string) {
  const networks = useNetworks(domainId);
  const createNetwork = useCreateNetwork();
  const updateNetwork = useUpdateNetwork();
  const deleteNetwork = useDeleteNetwork();

  return {
    // Query operations
    networks: networks.networks,
    isLoading: networks.isLoading,
    isError: networks.isError,
    error: networks.error,
    errorMessage: networks.errorMessage,
    refetch: networks.refetch,
    isRefetching: networks.isRefetching,

    // Mutation operations
    createNetwork: createNetwork.createNetwork,
    createNetworkAsync: createNetwork.createNetworkAsync,
    isCreating: createNetwork.isCreating,
    createError: createNetwork.error,
    createErrorMessage: createNetwork.errorMessage,

    updateNetwork: updateNetwork.updateNetwork,
    updateNetworkAsync: updateNetwork.updateNetworkAsync,
    isUpdating: updateNetwork.isUpdating,
    updateError: updateNetwork.error,
    updateErrorMessage: updateNetwork.errorMessage,

    deleteNetwork: deleteNetwork.deleteNetwork,
    deleteNetworkAsync: deleteNetwork.deleteNetworkAsync,
    isDeleting: deleteNetwork.isDeleting,
    deleteError: deleteNetwork.error,
    deleteErrorMessage: deleteNetwork.errorMessage,

    // Combined loading states
    isAnyMutationPending:
      createNetwork.isCreating ||
      updateNetwork.isUpdating ||
      deleteNetwork.isDeleting,

    // Reset functions
    resetAll: () => {
      createNetwork.reset();
      updateNetwork.reset();
      deleteNetwork.reset();
    },
  };
}
