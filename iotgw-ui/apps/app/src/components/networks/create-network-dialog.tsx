import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import type { CreateNetworkInput } from "@iotgw/supabase-contract";

export interface CreateNetworkDialogProps {
  domainId: string;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function CreateNetworkDialog({
  domainId,
  trigger,
  onSuccess,
}: CreateNetworkDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { getErrorMessage } = useNetworkErrorHandling();
  const [isOpen, setIsOpen] = useState(false);

  const createNetworkMutation = useMutation({
    ...trpc.createNetwork.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.getNetworksByDomain.queryKey({ domain_id: domainId }),
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.getNetworkCounts.queryKey(),
      });
      setIsOpen(false);
      onSuccess?.();
      toast.success(
        t("networks.createSuccess") ?? "Network created successfully",
      );
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const handleSubmit = (data: CreateNetworkInput) => {
    createNetworkMutation.mutate(data);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const defaultTrigger = (
    <Button>
      <Plus className="mr-2 h-4 w-4" />
      {t("networks.createNetwork")}
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("networks.createNetwork")}</DialogTitle>
          <DialogDescription>
            {t("networks.createNetworkDescription") ??
              "Create a new network with a unique name and optional network configuration."}
          </DialogDescription>
        </DialogHeader>
        <NetworkForm
          mode="create"
          domainId={domainId}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isSubmitting={createNetworkMutation.isPending}
          submitError={
            createNetworkMutation.error
              ? getErrorMessage(createNetworkMutation.error)
              : null
          }
        />
      </DialogContent>
    </Dialog>
  );
}
