// Export all network-related components from this index file
export { NetworkForm, useNetworkFormValidation } from "./network-form";
export { NetworkList } from "./network-list";
export { CreateNetworkDialog } from "./create-network-dialog";
export { EditNetworkDialog } from "./edit-network-dialog";
export { DeleteNetworkDialog } from "./delete-network-dialog";
export type { NetworkFormProps } from "./network-form";
export type { CreateNetworkDialogProps } from "./create-network-dialog";
export type { EditNetworkDialogProps } from "./edit-network-dialog";
export type { DeleteNetworkDialogProps } from "./delete-network-dialog";

// Re-export network types for convenience
export type {
  Network,
  CreateNetworkInput,
  UpdateNetworkInput,
  NetworkIdInput,
  NetworksByDomainInput,
} from "@iotgw/supabase-contract";
