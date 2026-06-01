// Export all domain-related components from this index file
export { DomainForm, useDomainFormValidation } from "./domain-form";
export { DomainList } from "./domain-list";
export { DomainErrorBoundary } from "./domain-error-boundary";
export type { DomainFormProps } from "./domain-form";

// Re-export domain types for convenience
export type {
  Domain,
  CreateDomainInput,
  UpdateDomainInput,
  DomainIdInput,
} from "@iotgw/supabase-contract";
