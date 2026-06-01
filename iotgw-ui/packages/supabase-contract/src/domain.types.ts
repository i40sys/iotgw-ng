/**
 * Represents a domain in the IoT Gateway system
 */
export type Domain = {
  id: string;
  name: string;
  display_name: string;
  created_at: string;
  updated_at: string;
};

/**
 * Input for creating a new domain
 */
export type CreateDomainInput = {
  name: string;
  display_name: string;
};

/**
 * Input for updating an existing domain
 */
export type UpdateDomainInput = {
  id: string;
  name?: string;
  display_name?: string;
};

/**
 * Input for domain operations that only require an ID
 */
export type DomainIdInput = {
  id: string;
};
