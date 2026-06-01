import React from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import { Button } from "./button";
import { Save, Trash2 } from "lucide-react";

export interface UnsavedChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
  onCancel?: () => void;
  title?: string;
  description?: string;
  saveLabel?: string;
  discardLabel?: string;
  cancelLabel?: string;
  isSaving?: boolean;
}

export function UnsavedChangesDialog({
  open,
  onOpenChange,
  onSave,
  onDiscard,
  onCancel,
  title,
  description,
  saveLabel,
  discardLabel,
  cancelLabel,
  isSaving = false,
}: UnsavedChangesDialogProps) {
  const { t } = useTranslation();

  const handleSave = async () => {
    try {
      await onSave();
      onOpenChange(false);
    } catch (error) {
      // Error handling is expected to be handled by the onSave function
      console.error("Failed to save changes:", error);
    }
  };

  const handleDiscard = () => {
    onDiscard();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {title || t("common.unsavedChanges")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description || t("common.unsavedChangesDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-3">
          <AlertDialogCancel onClick={handleCancel} disabled={isSaving}>
            {cancelLabel || t("buttons.cancel")}
          </AlertDialogCancel>
          <Button
            variant="outline"
            onClick={handleDiscard}
            disabled={isSaving}
            className="flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {discardLabel || t("buttons.discard")}
          </Button>
          <AlertDialogAction
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {isSaving ? t("common.saving") : saveLabel || t("buttons.save")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
