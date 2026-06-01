import { useCallback, useState } from "react";
import {
  useUnsavedChanges,
  type UseUnsavedChangesOptions,
} from "./use-unsaved-changes";
import { useNavigationGuard } from "./use-navigation-guard";

export interface UnsavedChangesGuardOptions extends UseUnsavedChangesOptions {
  onSave?: () => void | Promise<void>;
  onDiscard?: () => void;
}

export interface UnsavedChangesGuardState {
  hasUnsavedChanges: boolean;
  savedValue: string;
  currentValue: string;
  showDialog: boolean;
  isDialogMode: "navigation" | "device-change" | "version-change" | null;
}

export interface UnsavedChangesGuardActions {
  setSavedValue: (value: string) => void;
  setCurrentValue: (value: string) => void;
  markAsSaved: () => void;
  reset: () => void;
  showConfirmationDialog: (
    mode: "navigation" | "device-change" | "version-change",
  ) => void;
  hideConfirmationDialog: () => void;
  handleSave: () => Promise<void>;
  handleDiscard: () => void;
  handleCancel: () => void;
}

/**
 * High-level hook that combines unsaved changes detection with navigation guard
 * and confirmation dialogs
 */
export function useUnsavedChangesGuard({
  initialValue = "",
  onChange,
  compare,
  onSave,
  onDiscard,
}: UnsavedChangesGuardOptions = {}): UnsavedChangesGuardState &
  UnsavedChangesGuardActions {
  const [showDialog, setShowDialog] = useState(false);
  const [isDialogMode, setIsDialogMode] = useState<
    "navigation" | "device-change" | "version-change" | null
  >(null);

  const unsavedChanges = useUnsavedChanges({
    initialValue,
    onChange,
    compare,
  });

  const navigationGuard = useNavigationGuard({
    hasUnsavedChanges: unsavedChanges.hasUnsavedChanges,
    onNavigationBlocked: () => {
      showConfirmationDialog("navigation");
    },
  });

  const showConfirmationDialog = useCallback(
    (mode: "navigation" | "device-change" | "version-change") => {
      if (unsavedChanges.hasUnsavedChanges) {
        setIsDialogMode(mode);
        setShowDialog(true);
      }
    },
    [unsavedChanges.hasUnsavedChanges],
  );

  const hideConfirmationDialog = useCallback(() => {
    setShowDialog(false);
    setIsDialogMode(null);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await onSave?.();
      unsavedChanges.markAsSaved();
      hideConfirmationDialog();
    } catch (error) {
      // Error handling is expected to be handled by the onSave function
      console.error("Failed to save changes:", error);
      throw error;
    }
  }, [onSave, unsavedChanges, hideConfirmationDialog]);

  const handleDiscard = useCallback(() => {
    onDiscard?.();
    unsavedChanges.reset();
    hideConfirmationDialog();
  }, [onDiscard, unsavedChanges, hideConfirmationDialog]);

  const handleCancel = useCallback(() => {
    hideConfirmationDialog();
  }, [hideConfirmationDialog]);

  return {
    hasUnsavedChanges: unsavedChanges.hasUnsavedChanges,
    savedValue: unsavedChanges.savedValue,
    currentValue: unsavedChanges.currentValue,
    showDialog,
    isDialogMode,
    setSavedValue: unsavedChanges.setSavedValue,
    setCurrentValue: unsavedChanges.setCurrentValue,
    markAsSaved: unsavedChanges.markAsSaved,
    reset: unsavedChanges.reset,
    showConfirmationDialog,
    hideConfirmationDialog,
    handleSave,
    handleDiscard,
    handleCancel,
  };
}
