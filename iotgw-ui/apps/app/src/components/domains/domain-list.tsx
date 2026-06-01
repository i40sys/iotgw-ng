import { useTranslation } from "react-i18next";
import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import type { Domain } from "@iotgw/supabase-contract";

interface DomainListProps {
  domains: Domain[];
  networkCounts?: Record<string, number>;
  onEdit?: (domain: Domain) => void;
  onDelete?: (domain: Domain) => void;
  isLoading?: boolean;
  isDeleting?: boolean;
}

export function DomainList({
  domains,
  networkCounts,
  onEdit,
  onDelete,
  isLoading = false,
  isDeleting = false,
}: DomainListProps) {
  const { t } = useTranslation();
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    domain: Domain | null;
  }>({
    isOpen: false,
    domain: null,
  });

  const handleDeleteClick = (domain: Domain) => {
    setDeleteConfirm({
      isOpen: true,
      domain,
    });
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm.domain && onDelete) {
      onDelete(deleteConfirm.domain);
    }
    setDeleteConfirm({
      isOpen: false,
      domain: null,
    });
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm({
      isOpen: false,
      domain: null,
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
              <TableHead>{t("domains.name")}</TableHead>
              <TableHead>{t("domains.displayName")}</TableHead>
              <TableHead>Networks</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Updated At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {domains.map((domain) => (
              <TableRow key={domain.id} className="hover:bg-muted/50">
                <TableCell className="font-medium">{domain.name}</TableCell>
                <TableCell>{domain.display_name}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-mono">
                    {networkCounts?.[domain.id] ?? 0}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(domain.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(domain.updated_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {onEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(domain)}
                        disabled={isDeleting}
                      >
                        <FontAwesomeIcon
                          icon={faPen}
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
                        <span className="sr-only">
                          {t("domains.editDomain")} {domain.display_name}
                        </span>
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(domain)}
                        disabled={isDeleting}
                      >
                        <FontAwesomeIcon
                          icon={faTrash}
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
                        <span className="sr-only">
                          {t("domains.deleteDomain")} {domain.display_name}
                        </span>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {domains.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-8 text-center"
                >
                  {t("domains.noDomains")}
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
            <AlertDialogTitle>{t("domains.deleteDomain")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("domains.confirmDelete")} "{deleteConfirm.domain?.display_name}
              "? This action cannot be undone.
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
