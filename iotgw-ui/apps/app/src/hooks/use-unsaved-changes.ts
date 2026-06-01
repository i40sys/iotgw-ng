import { useCallback, useEffect, useRef, useState } from "react";

export interface UnsavedChangesState {
  hasUnsavedChanges: boolean;
  savedValue: string;
  currentValue: string;
}

export interface UnsavedChangesActions {
  setSavedValue: (value: string) => void;
  setCurrentValue: (value: string) => void;
  markAsSaved: () => void;
  reset: () => void;
}

export interface UseUnsavedChangesOptions {
  initialValue?: string;
  onChange?: (hasChanges: boolean) => void;
  compare?: (saved: string, current: string) => boolean;
}

/**
 * Hook for tracking unsaved changes by comparing a saved value with current value
 */
export function useUnsavedChanges({
  initialValue = "",
  onChange,
  compare = (saved, current) => saved !== current,
}: UseUnsavedChangesOptions = {}): UnsavedChangesState & UnsavedChangesActions {
  const [savedValue, setSavedValue] = useState<string>(initialValue);
  const [currentValue, setCurrentValue] = useState<string>(initialValue);
  const onChangeRef = useRef(onChange);

  // Update ref when onChange prop changes
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Calculate if there are unsaved changes
  const hasUnsavedChanges = compare(savedValue, currentValue);

  // Call onChange when unsaved changes state changes
  useEffect(() => {
    onChangeRef.current?.(hasUnsavedChanges);
  }, [hasUnsavedChanges]);

  const markAsSaved = useCallback(() => {
    setSavedValue(currentValue);
  }, [currentValue]);

  const reset = useCallback(() => {
    setCurrentValue(savedValue);
  }, [savedValue]);

  return {
    hasUnsavedChanges,
    savedValue,
    currentValue,
    setSavedValue,
    setCurrentValue,
    markAsSaved,
    reset,
  };
}
