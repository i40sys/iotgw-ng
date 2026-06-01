import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NetworkForm } from "./network-form";
import { useNetworkErrorHandling } from "@/hooks/use-network-validation";
import { trpc } from "@/utils/trpc";
import type { Network, UpdateNetworkInput } from "@iotgw/supabase-contract";

export interface EditNetworkDialogProps {
  network: Network;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function EditNetworkDialog({
  network,
  trigger,
  onSuccess,
}: EditNetworkDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { getErrorMessage } = useNetworkErrorHandling();
  const [isOpen, setIsOpen] = useState(false);

  const updateNetworkMutation = useMutation({
    ...trpc.updateNetwork.mutationOptions(),
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
        t("networks.updateSuccess") ?? "Network updated successfully",
      );
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const handleSubmit = (data: UpdateNetworkInput) => {
    updateNetworkMutation.mutate(data);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const defaultTrigger = (
    <Button variant="ghost" size="sm">
      <Pencil className="h-4 w-4" />
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("networks.editNetwork")}</DialogTitle>
          <DialogDescription>
            {t("networks.editNetworkDescription") ??
              "Update the network name and configuration."}
          </DialogDescription>
        </DialogHeader>
        <NetworkForm
          mode="edit"
          domainId={network.domain_id}
          initialData={network}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isSubmitting={updateNetworkMutation.isPending}
          submitError={
            updateNetworkMutation.error
              ? getErrorMessage(updateNetworkMutation.error)
              : null
          }
        />
      </DialogContent>
    </Dialog>
  );
}
