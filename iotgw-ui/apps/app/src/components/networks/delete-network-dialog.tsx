import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useNetworkErrorHandling } from "@/hooks/use-network-validation";
import { trpc } from "@/utils/trpc";
import type { Network, NetworkIdInput } from "@iotgw/supabase-contract";

export interface DeleteNetworkDialogProps {
  network: Network;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function DeleteNetworkDialog({
  network,
  trigger,
  onSuccess,
}: DeleteNetworkDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { getErrorMessage } = useNetworkErrorHandling();
  const [isOpen, setIsOpen] = useState(false);

  const deleteNetworkMutation = useMutation({
    ...trpc.deleteNetwork.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.getNetworksByDomain.queryKey({
          domain_id: network.domain_id,
        }),
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.getNetworkCounts.queryKey(),
      });
      setIsOpen(false);
      onSuccess?.();
      toast.success(
        t("networks.deleteSuccess") ?? "Network deleted successfully",
      );
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const handleDeleteConfirm = () => {
    const deleteData: NetworkIdInput = { id: network.id };
    deleteNetworkMutation.mutate(deleteData);
  };

  const defaultTrigger = (
    <Button variant="ghost" size="sm">
      <Trash2 className="h-4 w-4" />
    </Button>
  );

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        {trigger ?? defaultTrigger}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("networks.deleteNetwork")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("networks.confirmDelete")} "{network.name}"?
            <br />
            <br />
            <strong>Network Details:</strong>
            <br />
            <span className="text-muted-foreground text-sm">
              Name: {network.name}
              {network.cidr && (
                <>
                  <br />
                  CIDR: {network.cidr}
                </>
              )}
              {network.ipv4 && (
                <>
                  <br />
                  IPv4: {network.ipv4}
                </>
              )}
              {network.ipv6 && (
                <>
                  <br />
                  IPv6: {network.ipv6}
                </>
              )}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("buttons.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteConfirm}
            disabled={deleteNetworkMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
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
  );
}
