# Supabase Contract Package

This package provides shared TypeScript types for Supabase database tables and domain-specific entities. It enables type consistency between the frontend and backend applications.

## Features

- **Generated Database Types**: Automatically generated types from Supabase schema
- **Domain-Specific Types**: Custom types for application entities
- **Dual Format Output**: Supports both ESM and CommonJS imports
- **Type Declarations**: Full TypeScript declarations for IDE support

## Directory Structure

- `src/`: Source code
  - `database.types.ts`: Auto-generated Supabase database types
  - `device.types.ts`: Domain-specific device types
  - `index.ts`: Entry point that exports all types
- `dist/`: Build output (generated)
- `tsdown.config.ts`: Build configuration

## Key Types

### Database Types

The package includes complete type definitions for Supabase database tables:

```typescript
export type Database = {
  public: {
    Tables: {
      devices: {
        Row: { ... }
        Insert: { ... }
        Update: { ... }
      }
      // Other tables...
    }
    // Functions, enums, etc.
  }
}
```

### Domain Types

Domain-specific types that represent business entities:

```typescript
export type Device = {
  id: string;
  hostname: string;
  ip_address: string | null;
  mac_address: string | null;
  os: string | null;
  status: DeviceStatus;
  last_seen_at: string;
  created_at: string;
};

export type DeviceStatus = "online" | "offline" | "maintenance" | "unknown";
```

## Usage

### In Frontend or Backend

```typescript
import { Device, DeviceStatus } from "@iotgw/supabase-contract";

// Type-safe device object
const device: Device = {
  id: "123",
  hostname: "device-1",
  ip_address: "192.168.1.100",
  mac_address: "00:11:22:33:44:55",
  os: "Linux",
  status: "online",
  last_seen_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
};
```

## Development

### Installing Dependencies

```bash
pnpm install
```

### Generating Database Types

```bash
pnpm generate
```

This will connect to your Supabase project and generate the database types.

### Building the Package

```bash
pnpm build
```

This uses tsdown to generate both ESM and CommonJS outputs.

### Development Mode

```bash
pnpm dev
```

Watches for changes and rebuilds automatically.

## Maintenance

When the Supabase schema changes, run the generate command to update the types:

```bash
pnpm generate
```
