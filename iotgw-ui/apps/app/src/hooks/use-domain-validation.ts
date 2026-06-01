import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { trpc } from "@/utils/trpc";

/**
 * Hook for validating domain names against existing domains
 */
export function useDomainValidation() {
  const { t } = useTranslation();

  const domainsQuery = useQuery(trpc.getDomains.queryOptions());

  const validateDomainName = (name: string, excludeId?: string) => {
    if (!name || !domainsQuery.data) {
      return { isValid: true, error: null };
    }

    // Check if the name already exists (excluding the current domain if editing)
    const existingDomain = domainsQuery.data.find(
      (domain) =>
        domain.name.toLowerCase() === name.toLowerCase() &&
        domain.id !== excludeId,
    );

    if (existingDomain) {
      return {
        isValid: false,
        error:
          t("domains.nameAlreadyExists") ||
          "A domain with this name already exists",
      };
    }

    // Check name format
    const namePattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
    if (!namePattern.test(name)) {
      return {
        isValid: false,
        error:
          t("domains.invalidNameFormat") ||
          "Domain name must contain only letters, numbers, and hyphens, and cannot start or end with a hyphen",
      };
    }

    // Check length
    if (name.length > 50) {
      return {
        isValid: false,
        error:
          t("domains.nameTooLong") ||
          "Domain name must be less than 50 characters",
      };
    }

    return { isValid: true, error: null };
  };

  const validateDisplayName = (displayName: string) => {
    if (!displayName) {
      return {
        isValid: false,
        error: t("domains.displayNameRequired") || "Display name is required",
      };
    }

    if (displayName.length > 100) {
      return {
        isValid: false,
        error:
          t("domains.displayNameTooLong") ||
          "Display name must be less than 100 characters",
      };
    }

    return { isValid: true, error: null };
  };

  return {
    validateDomainName,
    validateDisplayName,
    isLoading: domainsQuery.isLoading,
  };
}

/**
 * Enhanced error handling for domain operations
 */
export function useDomainErrorHandling() {
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
        t("domains.nameAlreadyExists") ??
        "A domain with this name already exists"
      );
    }

    if (errorObj.code === "NOT_FOUND") {
      return t("domains.notFound") ?? "Domain not found";
    }

    if (errorObj.code === "INTERNAL_SERVER_ERROR") {
      return (
        t("domains.serverError") ?? "Server error occurred. Please try again."
      );
    }

    if (errorObj.code === "UNAUTHORIZED") {
      return (
        t("domains.unauthorized") ??
        "You are not authorized to perform this action"
      );
    }

    if (errorObj.code === "BAD_REQUEST") {
      return t("domains.invalidData") ?? "Invalid data provided";
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
