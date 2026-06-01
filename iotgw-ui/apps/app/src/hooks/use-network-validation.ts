import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { trpc } from "@/utils/trpc";

/**
 * Hook for validating network names against existing networks within a domain
 */
export function useNetworkValidation(domainId?: string) {
  const { t } = useTranslation();

  const networksQuery = useQuery({
    ...trpc.getNetworksByDomain.queryOptions({ domain_id: domainId! }),
    enabled: !!domainId,
  });

  const validateNetworkName = (name: string, excludeId?: string) => {
    if (!name || !networksQuery.data || !domainId) {
      return { isValid: true, error: null };
    }

    // Check if the name already exists within the domain (excluding the current network if editing)
    const existingNetwork = networksQuery.data.find(
      (network) =>
        network.name.toLowerCase() === name.toLowerCase() &&
        network.id !== excludeId,
    );

    if (existingNetwork) {
      return {
        isValid: false,
        error:
          t("networks.nameAlreadyExists") ||
          "A network with this name already exists in this domain",
      };
    }

    // Check name format - same as NetworkForm validation
    const namePattern = /^[a-zA-Z0-9]([a-zA-Z0-9-_\s]*[a-zA-Z0-9])?$/;
    if (!namePattern.test(name)) {
      return {
        isValid: false,
        error:
          t("networks.invalidNameFormat") ||
          "Network name must contain only letters, numbers, hyphens, underscores, and spaces, and cannot start or end with special characters",
      };
    }

    // Check length
    if (name.length > 100) {
      return {
        isValid: false,
        error:
          t("networks.nameTooLong") ||
          "Network name must be less than 100 characters",
      };
    }

    return { isValid: true, error: null };
  };

  return {
    validateNetworkName,
    isLoading: networksQuery.isLoading,
  };
}

/**
 * Enhanced error handling for network operations
 */
export function useNetworkErrorHandling() {
  const { t } = useTranslation();

  const getErrorMessage = (error: unknown): string => {
    if (!error) return t("common.error") ?? "An error occurred";

    // Type guard for error objects with code and message
    const isErrorWithCode = (
      err: unknown,
    ): err is { code?: string; message?: string } => {
      return typeof err === "object" && err !== null;
    };

    const errorObj = isErrorWithCode(error) ? error : {};

    // Handle specific error codes
    if (errorObj.code === "CONFLICT") {
      return (
        t("networks.nameAlreadyExists") ??
        "A network with this name already exists in this domain"
      );
    }

    if (errorObj.code === "NOT_FOUND") {
      return t("networks.notFound") ?? "Network not found";
    }

    if (errorObj.code === "INTERNAL_SERVER_ERROR") {
      return (
        t("networks.serverError") ?? "Server error occurred. Please try again."
      );
    }

    if (errorObj.code === "UNAUTHORIZED") {
      return (
        t("networks.unauthorized") ??
        "You are not authorized to perform this action"
      );
    }

    if (errorObj.code === "BAD_REQUEST") {
      return t("networks.invalidData") ?? "Invalid data provided";
    }

    // Handle validation-specific errors
    if (errorObj.message?.includes("CIDR")) {
      return (
        t("networks.invalidCidr") ??
        "CIDR must be in valid format (e.g., 192.168.1.0/24 or 2001:db8::/32)"
      );
    }

    if (errorObj.message?.includes("IPv4")) {
      return (
        t("networks.invalidIpv4") ??
        "IPv4 must be in valid format (e.g., 192.168.1.1)"
      );
    }

    if (errorObj.message?.includes("IPv6")) {
      return (
        t("networks.invalidIpv6") ??
        "IPv6 must be in valid format (e.g., 2001:db8::1)"
      );
    }

    // Handle network errors
    if (
      errorObj.message?.includes("fetch") ||
      errorObj.message?.includes("network")
    ) {
      return (
        t("common.networkError") ??
        "Network error. Please check your connection."
      );
    }

    // Fallback to the actual error message or a generic one
    return (
      errorObj.message ?? t("common.error") ?? "An unexpected error occurred"
    );
  };

  return {
    getErrorMessage,
  };
}
