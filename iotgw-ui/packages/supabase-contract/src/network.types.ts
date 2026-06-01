/**
 * Represents a network in the IoT Gateway system
 */
export type Network = {
  id: string;
  domain_id: string;
  name: string;
  ipv4_cidr: string | null;
  ipv6_cidr: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Input for creating a new network
 */
export type CreateNetworkInput = {
  domain_id: string;
  name: string;
  ipv4_cidr?: string | null;
  ipv6_cidr?: string | null;
};

/**
 * Input for updating an existing network
 */
export type UpdateNetworkInput = {
  id: string;
  domain_id?: string;
  name?: string;
  ipv4_cidr?: string | null;
  ipv6_cidr?: string | null;
};

/**
 * Input for network operations that only require an ID
 */
export type NetworkIdInput = {
  id: string;
};

/**
 * Input for listing networks by domain
 */
export type NetworksByDomainInput = {
  domain_id: string;
};
