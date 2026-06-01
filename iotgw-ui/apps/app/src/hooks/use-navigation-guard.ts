import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";

export interface NavigationGuardOptions {
  hasUnsavedChanges: boolean;
  onNavigationBlocked?: () => void;
  onNavigationAllowed?: () => void;
}

/**
 * Hook to guard against navigation when there are unsaved changes
 * Uses browser beforeunload event and TanStack Router navigation events
 */
export function useNavigationGuard({
  hasUnsavedChanges,
  onNavigationBlocked,
  onNavigationAllowed,
}: NavigationGuardOptions) {
  const router = useRouter();
  const onNavigationBlockedRef = useRef(onNavigationBlocked);
  const onNavigationAllowedRef = useRef(onNavigationAllowed);

  // Update refs when callbacks change
  useEffect(() => {
    onNavigationBlockedRef.current = onNavigationBlocked;
    onNavigationAllowedRef.current = onNavigationAllowed;
  }, [onNavigationBlocked, onNavigationAllowed]);

  // Browser beforeunload handler
  const handleBeforeUnload = useCallback(
    (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        const message =
          "You have unsaved changes. Are you sure you want to leave?";
        event.preventDefault();
        event.returnValue = message;
        onNavigationBlockedRef.current?.();
        return message;
      }
      onNavigationAllowedRef.current?.();
    },
    [hasUnsavedChanges],
  );

  // Install browser beforeunload handler
  useEffect(() => {
    if (hasUnsavedChanges) {
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
      };
    }
  }, [hasUnsavedChanges, handleBeforeUnload]);

  // TanStack Router navigation guard
  // Note: This is a simplified approach. For more complex scenarios,
  // you might need to use router.subscribe or custom route guards
  const blockNavigation = useCallback(() => {
    if (hasUnsavedChanges) {
      onNavigationBlockedRef.current?.();
      return false;
    }
    onNavigationAllowedRef.current?.();
    return true;
  }, [hasUnsavedChanges]);

  return {
    blockNavigation,
    hasUnsavedChanges,
  };
}
