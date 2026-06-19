---
id: doc-008
title: Domains, Networks, and Devices Architecture
type: documentation
created_date: "2025-09-24 06:30"
---

# Domains, Networks, and Devices Architecture

## Overview

The IoT Gateway system implements a hierarchical architecture for organizing and managing IoT infrastructure. This document describes the relationship between Domains, Networks, and Devices, their data models, and the implementation patterns used throughout the system.

## Architecture Hierarchy

```
Domain
  └── Network(s)
        └── Device(s)
```

### Core Concepts

1. **Domain**: The top-level organizational unit that represents a logical grouping or boundary
2. **Network**: A subnet or network segment within a domain that contains devices
3. **Device**: An IoT endpoint or gateway device connected to a specific network

## Data Models

### Domain Model

```typescript
// packages/supabase-contract/src/domain.types.ts
export type Domain = {
  id: string; // UUID primary key
  name: string; // Unique identifier (e.g., "production")
  display_name: string; // Human-readable name
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
};
```

**Key Characteristics:**

- Top-level entity with no parent relationships
- Contains multiple networks
- Cascade deletion - removing a domain removes all child networks and devices
- Unique constraint on `name` field for system identification

### Network Model

```typescript
// packages/supabase-contract/src/network.types.ts
export type Network = {
  id: string; // UUID primary key
  domain_id: string; // Foreign key to domains table
  name: string; // Network identifier
  ipv4_cidr: string | null; // IPv4 CIDR notation (e.g., "192.168.1.0/24")
  ipv6_cidr: string | null; // IPv6 CIDR notation
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
};
```

**Key Characteristics:**

- Child of a domain (many-to-one relationship)
- Parent of devices (one-to-many relationship)
- Supports both IPv4 and IPv6 address ranges
- Cascade deletion from parent domain
- Unique constraint on `name` within a domain

### Device Model

```typescript
// packages/supabase-contract/src/devices.types.ts
export type Device = {
  id: string; // UUID primary key
  network_id: string; // Foreign key to networks table
  name: string; // Device identifier
  description?: string; // Optional description
  ip_address: string; // Device IP address
  private_key?: string; // Encrypted private key for secure communication
  public_key?: string; // Public key for authentication
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
};
```

> **SUPERSEDED (see decision-010, ADR-001):** SSH key material is no longer stored in
> the `devices` table. Devices now store only an `ssh_key_id` reference; the actual
> private/public keys live in Cosmian KMS. The `private_key`/`public_key` columns above
> reflect the historical model and are retained for context only.

**Key Characteristics:**

- Child of a network (many-to-one relationship)
- Unique IP address constraint within a network (not globally)
- Secure key storage for device authentication
- Cascade deletion from parent network
- ~~Supports encrypted private key storage~~ **SUPERSEDED (decision-010):** keys are stored in Cosmian KMS; devices hold only `ssh_key_id`

## Database Schema

### Relationships

```sql
-- Foreign key relationships with CASCADE delete
ALTER TABLE networks
  ADD CONSTRAINT networks_domain_id_fkey
  FOREIGN KEY (domain_id)
  REFERENCES domains(id)
  ON DELETE CASCADE;

ALTER TABLE devices
  ADD CONSTRAINT devices_network_id_fkey
  FOREIGN KEY (network_id)
  REFERENCES networks(id)
  ON DELETE CASCADE;
```

### Unique Constraints

```sql
-- Domains have globally unique names
CREATE UNIQUE INDEX domains_name_unique ON domains(name);

-- Networks have unique names within a domain
CREATE UNIQUE INDEX networks_domain_name_unique ON networks(domain_id, name);

-- Devices have unique IP addresses within a network
CREATE UNIQUE INDEX devices_network_ip_unique ON devices(network_id, ip_address);
```

## API Layer Implementation

### tRPC Router Structure

Each entity has its own tRPC router with full CRUD operations:

```typescript
// apps/backend/src/routers/domains.ts
export const domainsRouter = createRouter({
  list: createQueryProcedure()...,
  getById: createQueryProcedure()...,
  create: createMutationProcedure()...,
  update: createMutationProcedure()...,
  delete: createMutationProcedure()...,
});

// apps/backend/src/routers/networks.ts
export const networksRouter = createRouter({
  list: createQueryProcedure()...,
  listByDomain: createQueryProcedure()...,
  getById: createQueryProcedure()...,
  create: createMutationProcedure()...,
  update: createMutationProcedure()...,
  delete: createMutationProcedure()...,
});

// apps/backend/src/routers/devices.ts
export const devicesRouter = createRouter({
  list: createQueryProcedure()...,
  listByNetwork: createQueryProcedure()...,
  getById: createQueryProcedure()...,
  create: createMutationProcedure()...,
  update: createMutationProcedure()...,
  delete: createMutationProcedure()...,
});
```

### Validation Patterns

Each router implements comprehensive Zod validation:

```typescript
// Example: Network creation validation
const createNetworkSchema = z.object({
  domain_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  ipv4_cidr: z.string().regex(IPV4_CIDR_REGEX).nullable().optional(),
  ipv6_cidr: z.string().regex(IPV6_CIDR_REGEX).nullable().optional(),
});
```

### Error Handling

Consistent error handling across all routers:

```typescript
if (error) {
  logger.error({ error }, "Failed to create network");
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Failed to create network",
  });
}
```

## Frontend Implementation

### Component Hierarchy

The UI follows the same hierarchical structure:

```
DomainList
  └── DomainDetail
        └── NetworkList
              └── NetworkDetail
                    └── DeviceList
                          └── DeviceDetail
```

### State Management

Using TanStack Query for server state:

```typescript
// Fetch domain with network count
const { data: domains } = api.domains.list.useQuery();

// Fetch networks for a specific domain
const { data: networks } = api.networks.listByDomain.useQuery({
  domain_id: domainId,
});

// Fetch devices for a specific network
const { data: devices } = api.devices.listByNetwork.useQuery({
  network_id: networkId,
});
```

### Navigation Flow

1. **Domain List View**: `/domains`

   - Displays all domains with network count
   - Click to navigate to domain detail

2. **Domain Detail View**: `/domains/:domainId`

   - Shows domain information
   - Lists all networks in the domain
   - Provides network management actions

3. **Network Management**: Inline within domain detail

   - Create/Edit/Delete networks
   - View network CIDR ranges
   - Navigate to device management

4. **Device Management**: Modal or dedicated view
   - List devices in network
   - Create/Edit/Delete devices
   - Manage device keys

## Security Considerations

### Row-Level Security (RLS)

All tables implement RLS policies:

```sql
-- Example: Devices table RLS
CREATE POLICY "Allow authenticated users to manage devices"
ON devices
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
```

### Key Management

> **SUPERSEDED (see decision-010, ADR-001):** Device SSH keys are now managed in
> Cosmian KMS, not the database. The `devices` table stores only `ssh_key_id`; the
> bullets below describe the historical in-database model and are kept for context.

- **Private Keys**: ~~Stored encrypted in database~~ stored in Cosmian KMS (referenced by `ssh_key_id`)
- **Public Keys**: Stored in plain text for verification
- **UI Handling**: Private keys are masked in forms
- **API Layer**: Keys are handled securely, never logged

### IP Address Management

- IP addresses are unique within a network, not globally
- Validation ensures IP addresses match network CIDR ranges
- Prevents IP conflicts within the same network

## Best Practices

### 1. Cascade Deletion

Always rely on database CASCADE constraints for hierarchical deletion:

- Deleting a domain removes all its networks and devices
- Deleting a network removes all its devices
- No orphaned records possible

### 2. Validation Layers

Implement validation at multiple levels:

- Database constraints (unique, foreign keys)
- API layer (Zod schemas)
- Frontend forms (react-hook-form with Zod)

### 3. Error Handling

Consistent error handling pattern:

- Database errors → tRPC errors
- tRPC errors → User-friendly messages
- Proper error boundaries in React components

### 4. Performance Optimization

- Use database indexes for foreign keys and commonly queried fields
- Implement pagination for large lists
- Use React Query caching for frequently accessed data
- Batch related queries when possible

### 5. Type Safety

Maintain end-to-end type safety:

- Database types generated from schema
- Shared types in contract package
- tRPC provides automatic type inference
- Frontend components use strict TypeScript

## Migration Guide

When modifying the hierarchy:

1. **Database Migration**: Update schema with proper constraints
2. **Type Generation**: Run `pnpm generate:contract`
3. **API Updates**: Modify tRPC routers as needed
4. **Frontend Updates**: Update components and queries
5. **Testing**: Verify cascade operations work correctly

## Related Documentation

- [tRPC API Development Patterns](./trpc-api-development-patterns.md)
- [Supabase RLS Implementation Patterns](./supabase-rls-implementation-patterns.md)
- [React Component Development Guidelines](./react-component-development-guidelines.md)
