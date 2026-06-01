import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
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
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import type { Network } from "@iotgw/supabase-contract";

interface NetworkListProps {
  networks: Network[];
  onEdit?: (network: Network) => void;
  onDelete?: (network: Network) => void;
  isLoading?: boolean;
  isDeleting?: boolean;
}

export function NetworkList({
  networks,
  onEdit,
  onDelete,
  isLoading = false,
  isDeleting = false,
}: NetworkListProps) {
  const { t } = useTranslation();
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    network: Network | null;
  }>({
    isOpen: false,
    network: null,
  });

  const shortenUUID = (uuid: string) => {
    // Show first 8 characters of UUID
    return uuid.slice(0, 8);
  };

  const handleDeleteClick = (network: Network) => {
    setDeleteConfirm({
      isOpen: true,
      network,
    });
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm.network && onDelete) {
      onDelete(deleteConfirm.network);
    }
    setDeleteConfirm({
      isOpen: false,
      network: null,
    });
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm({
      isOpen: false,
      network: null,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
        <span className="ml-2">{t("common.loading")}</span>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("networks.name")}</TableHead>
              <TableHead>Network ID</TableHead>
              <TableHead>{t("networks.ipv4Cidr")}</TableHead>
              <TableHead>{t("networks.ipv6Cidr")}</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {networks.map((network) => (
              <TableRow key={network.id} className="hover:bg-muted/50">
                <TableCell className="font-medium">
                  <Link
                    to="/networks"
                    search={{ networkName: network.name }}
                    className="cursor-pointer text-blue-600 hover:underline dark:text-blue-400"
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
                <TableCell className="text-muted-foreground">
                  {network.ipv4_cidr ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {network.ipv6_cidr ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(network.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {onEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(network)}
                        disabled={isDeleting}
                      >
                        <FontAwesomeIcon
                          icon={faPen}
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
                        <span className="sr-only">
                          {t("networks.editNetwork")} {network.name}
                        </span>
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(network)}
                        disabled={isDeleting}
                      >
                        <FontAwesomeIcon
                          icon={faTrash}
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
                        <span className="sr-only">
                          {t("networks.deleteNetwork")} {network.name}
                        </span>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {networks.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-8 text-center"
                >
                  {t("networks.noNetworks")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirm.isOpen}
        onOpenChange={(open) => !open && handleDeleteCancel()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("networks.deleteNetwork")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("networks.confirmDelete")} "{deleteConfirm.network?.name}"?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>
              {t("buttons.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
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
    </>
  );
}
