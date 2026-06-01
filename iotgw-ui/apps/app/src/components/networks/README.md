# Network Dialog Components

This directory contains three dialog components for managing networks, following the exact patterns used in domain dialogs:

## Components

### CreateNetworkDialog

- **Purpose**: Creates a new network within a domain
- **Props**:
  - `domainId: string` (required) - The domain ID to create the network in
  - `trigger?: React.ReactNode` (optional) - Custom trigger element
  - `onSuccess?: () => void` (optional) - Callback after successful creation
- **Features**:
  - Uses NetworkForm in create mode
  - Provides default button trigger with Plus icon
  - Handles loading states and error feedback
  - Invalidates network queries on success

### EditNetworkDialog

- **Purpose**: Edits an existing network's details
- **Props**:
  - `network: Network` (required) - The network object to edit
  - `trigger?: React.ReactNode` (optional) - Custom trigger element
  - `onSuccess?: () => void` (optional) - Callback after successful update
- **Features**:
  - Uses NetworkForm in edit mode with pre-filled data
  - Provides default pencil icon trigger
  - Handles loading states and error feedback
  - Invalidates network queries on success

### DeleteNetworkDialog

- **Purpose**: Confirms and deletes a network
- **Props**:
  - `network: Network` (required) - The network object to delete
  - `trigger?: React.ReactNode` (optional) - Custom trigger element
  - `onSuccess?: () => void` (optional) - Callback after successful deletion
- **Features**:
  - Shows network details in confirmation dialog
  - Uses AlertDialog for destructive action
  - Provides default trash icon trigger
  - Handles loading states and error feedback
  - Invalidates network queries on success

## Usage Examples

```tsx
import {
  CreateNetworkDialog,
  EditNetworkDialog,
  DeleteNetworkDialog
} from '@/components/networks';

// Create dialog with default trigger
<CreateNetworkDialog domainId="domain-123" />

// Edit dialog with custom trigger
<EditNetworkDialog
  network={networkData}
  trigger={<Button>Edit Network</Button>}
/>

// Delete dialog with callback
<DeleteNetworkDialog
  network={networkData}
  onSuccess={() => console.log('Network deleted!')}
/>
```

## Error Handling

All dialogs use the `useNetworkErrorHandling` hook which provides:

- Specific error messages for validation failures (CIDR, IPv4, IPv6 format errors)
- Conflict handling for duplicate names
- Network connectivity error handling
- Internationalization support for all error messages

## Internationalization

All dialogs support i18n with keys under the `networks` namespace:

- `networks.createNetwork` / `networks.createNetworkDescription`
- `networks.editNetwork` / `networks.editNetworkDescription`
- `networks.deleteNetwork` / `networks.confirmDelete`
- Success/error message keys for feedback

## Dependencies

- Uses tRPC for API calls (`createNetwork`, `updateNetwork`, `deleteNetwork`)
- Integrates with TanStack Query for cache invalidation
- Uses Sonner for toast notifications
- Follows Shadcn/UI dialog patterns
- TypeScript typed with contract package types
