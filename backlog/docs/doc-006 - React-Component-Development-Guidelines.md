---
id: doc-006
title: React Component Development Guidelines
type: documentation
created_date: "2025-08-24 12:22"
---

# React Component Development Guidelines

## Overview

This document provides comprehensive guidelines for React component development in the IoT Gateway UI project, covering structure, naming conventions, TypeScript patterns, Shadcn/UI integration, form handling, data fetching, and styling best practices.

## Table of Contents

1. [Component Structure and Naming Conventions](#component-structure-and-naming-conventions)
2. [Props Interface Patterns and TypeScript Best Practices](#props-interface-patterns-and-typescript-best-practices)
3. [Shadcn/UI Component Customization Patterns](#shadcn-ui-component-customization-patterns)
4. [React Hook Form with Zod Validation Patterns](#react-hook-form-with-zod-validation-patterns)
5. [TanStack Query Data Fetching Patterns](#tanstack-query-data-fetching-patterns)
6. [Styling Patterns with Tailwind CSS v4](#styling-patterns-with-tailwind-css-v4)
7. [Component Testing Guidelines](#component-testing-guidelines)
8. [Performance Optimization](#performance-optimization)
9. [Accessibility Best Practices](#accessibility-best-practices)

## Component Structure and Naming Conventions

### File Structure and Organization

```
src/
├── components/
│   ├── ui/                    # Shadcn/UI base components
│   │   ├── button.tsx
│   │   ├── form.tsx
│   │   └── input.tsx
│   ├── device-card.tsx        # Feature-specific components
│   ├── device-form.tsx
│   ├── navigation-bar.tsx     # Layout components
│   └── app-sidebar.tsx
├── hooks/                     # Custom hooks
│   ├── use-device.ts
│   └── use-theme.ts
├── lib/
│   └── utils.ts              # Utility functions
└── routes/                   # Page components
    ├── devices.tsx
    └── device-creation.tsx
```

### Component Naming Conventions

#### File Naming

- Use **kebab-case** for file names: `device-status-card.tsx`
- Use **PascalCase** for component names: `DeviceStatusCard`
- Suffix with component type when needed: `DeviceForm`, `DeviceCard`, `DeviceList`

#### Component Categories

```typescript
// UI Components (in /components/ui/)
export function Button({ ... }) { ... }
export function Input({ ... }) { ... }

// Feature Components (in /components/)
export function DeviceCard({ ... }) { ... }
export function DeviceStatusMonitor({ ... }) { ... }

// Layout Components
export function NavigationBar({ ... }) { ... }
export function AppSidebar({ ... }) { ... }

// Page Components (in /routes/)
export default function DevicesPage() { ... }
export default function DeviceCreationPage() { ... }
```

### Component Structure Pattern

#### Standard Component Template

```typescript
import * as React from "react";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

// Props interface
interface ComponentNameProps {
  // Define props here
}

// Main component
export function ComponentName({
  className,
  ...props
}: ComponentNameProps & ComponentProps<"div">) {
  return (
    <div
      className={cn("base-styles", className)}
      {...props}
    >
      {/* Component content */}
    </div>
  );
}

// Display name for debugging
ComponentName.displayName = "ComponentName";
```

#### Component with Forward Ref

```typescript
import * as React from "react";
import { cn } from "@/lib/utils";

interface ComponentNameProps
  extends React.HTMLAttributes<HTMLDivElement> {
  // Component-specific props
  variant?: "default" | "secondary";
  size?: "sm" | "md" | "lg";
}

const ComponentName = React.forwardRef<
  HTMLDivElement,
  ComponentNameProps
>(({ className, variant = "default", size = "md", ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "base-component-styles",
        variant === "secondary" && "secondary-styles",
        size === "sm" && "small-styles",
        className
      )}
      {...props}
    />
  );
});

ComponentName.displayName = "ComponentName";

export { ComponentName };
```

### Directory Structure Guidelines

#### Feature-based Organization

```typescript
// components/domains/
├── domain-list.tsx           # Domain listing component
├── domain-form.tsx           # Domain create/edit form
├── domain-error-boundary.tsx # Error handling for domain operations

// components/networks/
├── network-list.tsx          # Network listing component
├── network-form.tsx          # Network create/edit form
├── create-network-dialog.tsx # Dialog for creating networks
├── edit-network-dialog.tsx   # Dialog for editing networks
├── delete-network-dialog.tsx # Confirmation dialog for deletion

// components/devices/
├── device-list.tsx           # Device listing component
├── device-form.tsx           # Device create/edit form
├── device-card.tsx           # Individual device display
├── device-form.tsx           # Create/edit form
├── device-status-badge.tsx   # Status indicator
└── index.ts                  # Re-export all components
```

#### Barrel Exports Pattern

```typescript
// components/device-management/index.ts
export { DeviceCard } from "./device-card";
export { DeviceList } from "./device-list";
export { DeviceForm } from "./device-form";
export { DeviceStatusBadge } from "./device-status-badge";

// Usage
import { DeviceCard, DeviceList } from "@/components/device-management";
```

## Props Interface Patterns and TypeScript Best Practices

### Basic Props Interface Pattern

```typescript
interface ComponentProps {
  // Required props
  title: string;
  data: Device[];

  // Optional props with defaults
  variant?: "default" | "compact";
  showHeader?: boolean;

  // Event handlers
  onSelect?: (device: Device) => void;
  onEdit?: (id: string) => void;

  // Children and render props
  children?: React.ReactNode;
  renderItem?: (device: Device) => React.ReactNode;
}
```

### Extending HTML Attributes

```typescript
// Extending specific HTML elements
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  isLoading?: boolean;
}

// Using ComponentProps for flexibility
interface CardProps extends React.ComponentProps<"div"> {
  title: string;
  description?: string;
}

// Omitting specific props when extending
interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md" | "lg"; // Custom size prop
}
```

### Generic Props Pattern

```typescript
// Generic component for different data types
interface DataTableProps<T> {
  data: T[];
  columns: Array<{
    key: keyof T;
    header: string;
    render?: (item: T) => React.ReactNode;
  }>;
  onRowClick?: (item: T) => void;
}

// Usage
function DataTable<T>({ data, columns, onRowClick }: DataTableProps<T>) {
  return (
    <table>
      {/* Implementation */}
    </table>
  );
}

// Type-safe usage
<DataTable<Device>
  data={devices}
  columns={[
    { key: "hostname", header: "Hostname" },
    { key: "status", header: "Status" },
  ]}
/>
```

### Prop Validation with Zod

```typescript
import { z } from "zod";

// Define schema for props validation
const componentPropsSchema = z.object({
  title: z.string().min(1),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  tags: z.array(z.string()).optional(),
});

type ComponentProps = z.infer<typeof componentPropsSchema>;

// Runtime validation in development
export function Component(rawProps: unknown) {
  const props = componentPropsSchema.parse(rawProps);

  return (
    <div>
      <h1>{props.title}</h1>
      <span>Priority: {props.priority}</span>
    </div>
  );
}
```

### Advanced TypeScript Patterns

#### Discriminated Unions for Variants

```typescript
// Status-based component variants
type StatusVariant =
  | { status: "loading"; message?: never }
  | { status: "error"; message: string }
  | { status: "success"; message?: string }
  | { status: "idle"; message?: never };

interface StatusDisplayProps extends StatusVariant {
  className?: string;
}

function StatusDisplay({ status, message, className }: StatusDisplayProps) {
  switch (status) {
    case "loading":
      return <LoadingSpinner className={className} />;
    case "error":
      return <ErrorMessage message={message} className={className} />;
    case "success":
      return <SuccessMessage message={message} className={className} />;
    case "idle":
      return null;
  }
}
```

## Shadcn/UI Component Customization Patterns

### Basic Component Customization

```typescript
// components/ui/button.tsx - Shadcn/UI Button Pattern
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Define variants using class-variance-authority
const buttonVariants = cva(
  // Base styles
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90",
        outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3",
        lg: "h-10 rounded-md px-6",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

// Component props interface
interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean; // Radix Slot pattern
}

// Component implementation
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        data-slot="button" // Data attribute for styling
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
```

### Custom Component Extension

```typescript
// Extending Shadcn/UI components
import { Button, buttonVariants } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface LoadingButtonProps extends React.ComponentProps<typeof Button> {
  isLoading?: boolean;
  loadingText?: string;
}

export function LoadingButton({
  isLoading = false,
  loadingText = "Loading...",
  children,
  disabled,
  ...props
}: LoadingButtonProps) {
  return (
    <Button
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <>
          <Loader2 className="size-4 animate-spin" />
          {loadingText}
        </>
      )}
      {!isLoading && children}
    </Button>
  );
}
```

### Form Component Pattern

```typescript
// components/ui/form.tsx - Shadcn/UI Form Pattern
import * as React from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

// Form context pattern
const Form = FormProvider;

interface FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  name: TName;
}

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue,
);

// FormField wrapper component
const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

// Custom hook for form field state
const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>");
  }

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

export { Form, FormField, useFormField };
```

## React Hook Form with Zod Validation Patterns

### Basic Form Setup

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// Define validation schema with complex patterns
const networkFormSchema = z.object({
  name: z.string()
    .min(1, "Network name is required")
    .max(100, "Network name must be less than 100 characters")
    .regex(
      /^[a-zA-Z0-9]([a-zA-Z0-9-_\s]*[a-zA-Z0-9])?$/,
      "Network name must contain only valid characters"
    ),
  ipv4_cidr: z.string()
    .optional()
    .refine(
      (value) => !value || value.trim() === "" || ipv4CidrRegex.test(value),
      "IPv4 CIDR must be in valid format (e.g., 192.168.1.0/24)"
    ),
  ipv6_cidr: z.string()
    .optional()
    .refine(
      (value) => !value || value.trim() === "" || ipv6CidrRegex.test(value),
      "IPv6 CIDR must be in valid format"
    ),
});

type NetworkFormData = z.infer<typeof networkFormSchema>;

// Regex patterns for validation
const ipv4CidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
const ipv6CidrRegex = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}\/\d{1,3}$/;

// Component implementation
export function DeviceForm({
  defaultValues,
  onSubmit,
}: {
  defaultValues?: Partial<DeviceFormData>;
  onSubmit: (data: DeviceFormData) => void;
}) {
  const form = useForm<DeviceFormData>({
    resolver: zodResolver(deviceFormSchema),
    defaultValues: {
      status: "unknown",
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="hostname"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hostname</FormLabel>
              <FormControl>
                <Input placeholder="Enter hostname" {...field} />
              </FormControl>
              <FormDescription>
                The hostname for the device
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving..." : "Save Device"}
        </Button>
      </form>
    </Form>
  );
}
```

### Advanced Form Patterns

#### Dynamic Form Fields

```typescript
const dynamicFormSchema = z.object({
  deviceType: z.enum(["sensor", "actuator", "gateway"]),
  commonFields: z.object({
    name: z.string().min(1),
    location: z.string().optional(),
  }),
  // Conditional fields based on device type
  sensorConfig: z.object({
    sensorType: z.string(),
    measurementUnit: z.string(),
  }).optional(),
  actuatorConfig: z.object({
    actuatorType: z.string(),
    controlRange: z.array(z.number()),
  }).optional(),
});

export function DynamicDeviceForm() {
  const form = useForm<z.infer<typeof dynamicFormSchema>>({
    resolver: zodResolver(dynamicFormSchema),
  });

  const deviceType = form.watch("deviceType");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* Device type selection */}
        <FormField
          control={form.control}
          name="deviceType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Device Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select device type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="sensor">Sensor</SelectItem>
                  <SelectItem value="actuator">Actuator</SelectItem>
                  <SelectItem value="gateway">Gateway</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        {/* Conditional fields */}
        {deviceType === "sensor" && (
          <FormField
            control={form.control}
            name="sensorConfig.sensorType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sensor Type</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        )}

        {deviceType === "actuator" && (
          <FormField
            control={form.control}
            name="actuatorConfig.actuatorType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Actuator Type</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        )}
      </form>
    </Form>
  );
}
```

#### Form with JSON Editor

```typescript
export function DeviceFormWithJsonEditor() {
  const [showJsonPanel, setShowJsonPanel] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const form = useForm<DeviceFormData>({
    resolver: zodResolver(deviceFormSchema),
  });

  // Watch form values for JSON sync
  const formValues = form.watch();

  useEffect(() => {
    setJsonText(JSON.stringify(formValues, null, 2));
  }, [formValues]);

  const handleJsonChange = (value: string) => {
    setJsonText(value);
    setJsonError(null);

    try {
      const parsedData = JSON.parse(value);
      const validatedData = deviceFormSchema.parse(parsedData);

      // Update form with validated JSON
      Object.entries(validatedData).forEach(([key, val]) => {
        form.setValue(key as keyof DeviceFormData, val);
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        setJsonError(`Validation error: ${error.errors[0]?.message}`);
      } else {
        setJsonError("Invalid JSON format");
      }
    }
  };

  return (
    <div className="flex gap-6">
      <div className={showJsonPanel ? "w-1/2" : "w-full"}>
        <Form {...form}>
          {/* Regular form fields */}
        </Form>
      </div>

      {showJsonPanel && (
        <div className="w-1/2">
          <div className="space-y-2">
            <Label>Form Data (JSON)</Label>
            <Textarea
              value={jsonText}
              onChange={(e) => handleJsonChange(e.target.value)}
              className="font-mono text-sm"
              rows={20}
            />
            {jsonError && (
              <div className="text-destructive text-sm">{jsonError}</div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center space-x-2">
        <Switch
          checked={showJsonPanel}
          onCheckedChange={setShowJsonPanel}
        />
        <Label>JSON Editor</Label>
      </div>
    </div>
  );
}
```

## TanStack Query Data Fetching Patterns

### Basic Query Usage with tRPC

```typescript
import { api } from "@/lib/trpc";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export function DomainList() {
  // Fetch domains list with automatic type inference
  const {
    data: domains,
    isLoading,
    error,
    refetch
  } = api.domains.list.useQuery();

  // Fetch network counts for each domain
  const { data: networkCounts } = api.networks.countByDomains.useQuery(
    { domainIds: domains?.map(d => d.id) ?? [] },
    { enabled: !!domains?.length } // Only fetch when domains exist
  );

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <ErrorDisplay
        error={error}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      {domains?.map((domain) => (
        <DomainCard
          key={domain.id}
          domain={domain}
          networkCount={networkCounts?.[domain.id] ?? 0}
        />
      ))}
    </div>
  );
}
```

### Conditional Queries

```typescript
export function DeviceDetails({ deviceId }: { deviceId?: string }) {
  const { data: device, isLoading } = trpc.getDevice.useQuery(
    { id: deviceId! },
    {
      enabled: !!deviceId, // Only fetch when deviceId exists
      staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
      cacheTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    }
  );

  if (!deviceId) {
    return <div>Please select a device</div>;
  }

  if (isLoading) {
    return <DeviceDetailsSkeleton />;
  }

  return device ? <DeviceCard device={device} /> : <div>Device not found</div>;
}
```

### Mutations with Optimistic Updates

```typescript
export function DeviceStatusToggle({ device }: { device: Device }) {
  const queryClient = useQueryClient();

  const updateStatusMutation = trpc.updateDeviceStatus.useMutation({
    // Optimistic update
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: ["getDevices"] });

      const previousDevices = queryClient.getQueryData(["getDevices"]);

      queryClient.setQueryData(["getDevices"], (old: Device[]) =>
        old?.map(d =>
          d.id === newData.deviceId
            ? { ...d, status: newData.status }
            : d
        ) ?? []
      );

      return { previousDevices };
    },
    // Rollback on error
    onError: (err, newData, context) => {
      if (context?.previousDevices) {
        queryClient.setQueryData(["getDevices"], context.previousDevices);
      }
      toast.error(`Failed to update device: ${err.message}`);
    },
    // Refetch on success
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["getDevices"] });
      toast.success(`Device status updated to ${data.status}`);
    },
  });

  const toggleStatus = () => {
    const newStatus = device.status === "online" ? "offline" : "online";
    updateStatusMutation.mutate({
      deviceId: device.id,
      status: newStatus,
    });
  };

  return (
    <Button
      onClick={toggleStatus}
      disabled={updateStatusMutation.isPending}
      variant={device.status === "online" ? "destructive" : "default"}
    >
      {updateStatusMutation.isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        device.status === "online" ? "Set Offline" : "Set Online"
      )}
    </Button>
  );
}
```

### Infinite Queries for Pagination

```typescript
export function InfiniteDeviceList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = trpc.getDevicesPaginated.useInfiniteQuery(
    { pageSize: 20 },
    {
      getNextPageParam: (lastPage) =>
        lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    }
  );

  const devices = data?.pages.flatMap(page => page.devices) ?? [];

  return (
    <div className="space-y-4">
      {devices.map((device) => (
        <DeviceCard key={device.id} device={device} />
      ))}

      {hasNextPage && (
        <Button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full"
        >
          {isFetchingNextPage ? "Loading more..." : "Load More"}
        </Button>
      )}
    </div>
  );
}
```

## Styling Patterns with Tailwind CSS v4

### Theme Configuration

```css
/* src/styles.css - Tailwind v4 with OKLCH colors */
@import "tailwindcss";

/* Custom variants */
@custom-variant dark (&:is(.dark *));

/* Theme variables */
@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  /* Color mappings */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-destructive: var(--destructive);
}

/* Light theme colors (OKLCH format) */
:root {
  --radius: 0.5rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.141 0.005 285.823);
  --primary: oklch(0.705 0.213 47.604);
  --primary-foreground: oklch(0.98 0.016 73.684);
  --destructive: oklch(0.577 0.245 27.325);
}

/* Dark theme colors */
.dark {
  --background: oklch(0.141 0.005 285.823);
  --foreground: oklch(0.985 0 0);
  --primary: oklch(0.646 0.222 41.116);
  --primary-foreground: oklch(0.98 0.016 73.684);
  --destructive: oklch(0.704 0.191 22.216);
}

/* Base styles */
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

### Component Styling Patterns

#### Using the `cn` Utility

```typescript
import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  variant = "default",
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        // Base styles
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        // Variant styles
        {
          "border-destructive bg-destructive/10": variant === "destructive",
          "border-primary bg-primary/10": variant === "highlighted",
        },
        // Custom className
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
```

#### Conditional Styling Patterns

```typescript
export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  return (
    <Badge
      className={cn(
        "inline-flex items-center gap-1.5",
        {
          "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400": status === "online",
          "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400": status === "offline",
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400": status === "maintenance",
          "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400": status === "unknown",
        }
      )}
    >
      <div
        className={cn(
          "size-2 rounded-full",
          {
            "bg-green-600": status === "online",
            "bg-red-600": status === "offline",
            "bg-yellow-600": status === "maintenance",
            "bg-gray-600": status === "unknown",
          }
        )}
      />
      {status}
    </Badge>
  );
}
```

#### Responsive Design Patterns

```typescript
export function DeviceGrid({ devices }: { devices: Device[] }) {
  return (
    <div className={cn(
      // Mobile-first responsive grid
      "grid gap-4",
      "grid-cols-1",           // 1 column on mobile
      "sm:grid-cols-2",        // 2 columns on small screens
      "md:grid-cols-3",        // 3 columns on medium screens
      "lg:grid-cols-4",        // 4 columns on large screens
      "xl:grid-cols-5",        // 5 columns on extra large screens
    )}>
      {devices.map((device) => (
        <DeviceCard
          key={device.id}
          device={device}
          className="h-full" // Ensure consistent heights
        />
      ))}
    </div>
  );
}
```

#### Animation and Transition Patterns

```typescript
export function CollapsibleSection({
  title,
  children,
  defaultOpen = false
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center justify-between p-4",
          "hover:bg-muted/50 transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        )}
      >
        <span className="font-medium">{title}</span>
        <ChevronDownIcon
          className={cn(
            "size-4 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      <div
        className={cn(
          "transition-all duration-200 ease-in-out overflow-hidden",
          isOpen ? "max-h-screen opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="p-4 pt-0">
          {children}
        </div>
      </div>
    </div>
  );
}
```

### Custom CSS Classes

```css
/* For custom animations and utilities */
@layer components {
  .device-card-hover {
    @apply transition-all duration-200 hover:scale-[1.02] hover:shadow-md;
  }

  .status-indicator {
    @apply inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium;
  }

  .form-section {
    @apply bg-card space-y-4 rounded-lg border p-6;
  }
}

@layer utilities {
  .text-balance {
    text-wrap: balance;
  }

  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: theme(colors.muted-foreground) transparent;
  }
}
```

## Dialog and Modal Patterns

### Confirmation Dialog Pattern

Use AlertDialog for destructive actions requiring confirmation:

```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

interface DeleteConfirmationProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description: string;
  isDeleting?: boolean;
}

export function DeleteConfirmation({
  isOpen,
  onConfirm,
  onCancel,
  title,
  description,
  isDeleting = false,
}: DeleteConfirmationProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onCancel}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

### Form Dialog Pattern

Use Dialog for forms and non-destructive actions:

```typescript
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CreateNetworkDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  domainId: string;
}

export function CreateNetworkDialog({
  isOpen,
  onOpenChange,
  domainId,
}: CreateNetworkDialogProps) {
  const utils = api.useUtils();
  const { t } = useTranslation();

  const createMutation = api.networks.create.useMutation({
    onSuccess: () => {
      // Invalidate and refetch networks list
      utils.networks.listByDomain.invalidate({ domain_id: domainId });
      onOpenChange(false);
      toast.success(t("networks.created_success"));
    },
    onError: (error) => {
      toast.error(t("networks.create_error", { error: error.message }));
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("networks.create_title")}</DialogTitle>
          <DialogDescription>
            {t("networks.create_description")}
          </DialogDescription>
        </DialogHeader>
        <NetworkForm
          domainId={domainId}
          onSubmit={(data) => createMutation.mutate(data)}
          isSubmitting={createMutation.isLoading}
        />
      </DialogContent>
    </Dialog>
  );
}
```

### Dialog State Management Pattern

Manage multiple dialogs with a single state object:

```typescript
interface DialogState {
  create: boolean;
  edit: { open: boolean; item: Network | null };
  delete: { open: boolean; item: Network | null };
}

export function NetworkManagement({ domainId }: { domainId: string }) {
  const [dialogs, setDialogs] = useState<DialogState>({
    create: false,
    edit: { open: false, item: null },
    delete: { open: false, item: null },
  });

  const openCreateDialog = () =>
    setDialogs((prev) => ({ ...prev, create: true }));

  const openEditDialog = (network: Network) =>
    setDialogs((prev) => ({
      ...prev,
      edit: { open: true, item: network },
    }));

  const openDeleteDialog = (network: Network) =>
    setDialogs((prev) => ({
      ...prev,
      delete: { open: true, item: network },
    }));

  const closeDialogs = () =>
    setDialogs({
      create: false,
      edit: { open: false, item: null },
      delete: { open: false, item: null },
    });

  return (
    <>
      <NetworkList
        onCreateClick={openCreateDialog}
        onEditClick={openEditDialog}
        onDeleteClick={openDeleteDialog}
      />

      <CreateNetworkDialog
        isOpen={dialogs.create}
        onOpenChange={(open) =>
          setDialogs((prev) => ({ ...prev, create: open }))
        }
        domainId={domainId}
      />

      {dialogs.edit.item && (
        <EditNetworkDialog
          isOpen={dialogs.edit.open}
          onOpenChange={(open) =>
            setDialogs((prev) => ({
              ...prev,
              edit: { ...prev.edit, open },
            }))
          }
          network={dialogs.edit.item}
        />
      )}

      {dialogs.delete.item && (
        <DeleteNetworkDialog
          isOpen={dialogs.delete.open}
          onOpenChange={(open) =>
            setDialogs((prev) => ({
              ...prev,
              delete: { ...prev.delete, open },
            }))
          }
          network={dialogs.delete.item}
        />
      )}
    </>
  );
}
```

## Component Testing Guidelines

### Unit Testing with Vitest and Testing Library

```typescript
// __tests__/components/device-card.test.tsx
import { render, screen } from "@testing-library/react";
import { DeviceCard } from "@/components/device-card";
import type { Device } from "@iotgw/supabase-contract";

const mockDevice: Device = {
  id: "test-id",
  hostname: "test-device",
  ip_address: "192.168.1.100",
  mac_address: "00:11:22:33:44:55",
  os: "Linux",
  status: "online",
  last_seen_at: "2023-12-01T10:00:00Z",
  created_at: "2023-12-01T09:00:00Z",
};

describe("DeviceCard", () => {
  it("renders device information correctly", () => {
    render(<DeviceCard device={mockDevice} />);

    expect(screen.getByText("test-device")).toBeInTheDocument();
    expect(screen.getByText("192.168.1.100")).toBeInTheDocument();
    expect(screen.getByText("online")).toBeInTheDocument();
  });

  it("handles missing IP address", () => {
    const deviceWithoutIP = { ...mockDevice, ip_address: null };
    render(<DeviceCard device={deviceWithoutIP} />);

    expect(screen.getByText("No IP Address")).toBeInTheDocument();
  });

  it("applies correct status styling", () => {
    render(<DeviceCard device={mockDevice} />);

    const statusBadge = screen.getByText("online");
    expect(statusBadge).toHaveClass("text-green-800");
  });
});
```

### Integration Testing

```typescript
// __tests__/integration/device-form.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeviceForm } from "@/components/device-form";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe("DeviceForm Integration", () => {
  it("submits form with valid data", async () => {
    const onSubmit = jest.fn();
    render(<DeviceForm onSubmit={onSubmit} />, { wrapper: createWrapper() });

    fireEvent.change(screen.getByLabelText("Hostname"), {
      target: { value: "test-device" },
    });
    fireEvent.change(screen.getByLabelText("IP Address"), {
      target: { value: "192.168.1.100" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Device" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        hostname: "test-device",
        ipAddress: "192.168.1.100",
        status: "unknown",
      });
    });
  });
});
```

## Performance Optimization

### Memoization Patterns

```typescript
import { memo, useMemo, useCallback } from "react";

// Memoize expensive components
export const DeviceCard = memo(({ device, onSelect }: DeviceCardProps) => {
  const statusColor = useMemo(() => {
    switch (device.status) {
      case "online": return "text-green-600";
      case "offline": return "text-red-600";
      default: return "text-gray-600";
    }
  }, [device.status]);

  const handleSelect = useCallback(() => {
    onSelect?.(device);
  }, [device, onSelect]);

  return (
    <div className="device-card" onClick={handleSelect}>
      <span className={statusColor}>{device.status}</span>
    </div>
  );
});

// Memoize list components
export const DeviceList = memo(({ devices, onDeviceSelect }: DeviceListProps) => {
  const handleDeviceSelect = useCallback((device: Device) => {
    onDeviceSelect?.(device);
  }, [onDeviceSelect]);

  return (
    <div>
      {devices.map((device) => (
        <DeviceCard
          key={device.id}
          device={device}
          onSelect={handleDeviceSelect}
        />
      ))}
    </div>
  );
});
```

### Virtual Scrolling for Large Lists

```typescript
import { FixedSizeList as List } from "react-window";

interface VirtualizedDeviceListProps {
  devices: Device[];
  height: number;
  itemHeight: number;
}

const DeviceItem = memo(({ index, style, data }: {
  index: number;
  style: React.CSSProperties;
  data: { devices: Device[] };
}) => (
  <div style={style}>
    <DeviceCard device={data.devices[index]} />
  </div>
));

export function VirtualizedDeviceList({
  devices,
  height,
  itemHeight
}: VirtualizedDeviceListProps) {
  return (
    <List
      height={height}
      itemCount={devices.length}
      itemSize={itemHeight}
      itemData={{ devices }}
    >
      {DeviceItem}
    </List>
  );
}
```

## Accessibility Best Practices

### ARIA Patterns

```typescript
export function DeviceStatusControls({ device }: { device: Device }) {
  const [isUpdating, setIsUpdating] = useState(false);

  return (
    <div role="group" aria-labelledby="device-controls-heading">
      <h3 id="device-controls-heading" className="sr-only">
        Device Controls for {device.hostname}
      </h3>

      <Button
        onClick={toggleStatus}
        disabled={isUpdating}
        aria-describedby={`status-${device.id}`}
        aria-pressed={device.status === "online"}
      >
        {device.status === "online" ? "Set Offline" : "Set Online"}
      </Button>

      <div
        id={`status-${device.id}`}
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {isUpdating ? "Updating device status" : `Device is currently ${device.status}`}
      </div>
    </div>
  );
}
```

### Focus Management

```typescript
export function DeviceDialog({ device, onClose }: DeviceDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Store the previously focused element
    previouslyFocusedElement.current = document.activeElement as HTMLElement;

    // Focus the dialog
    dialogRef.current?.focus();

    return () => {
      // Restore focus when dialog closes
      previouslyFocusedElement.current?.focus();
    };
  }, []);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-labelledby="dialog-title"
      aria-modal="true"
      tabIndex={-1}
      className="focus:outline-none"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          onClose();
        }
      }}
    >
      <h2 id="dialog-title">Device Details: {device.hostname}</h2>
      {/* Dialog content */}
    </div>
  );
}
```

---

This comprehensive guide provides the foundation for consistent, maintainable, and accessible React component development in the IoT Gateway UI project. Follow these patterns to ensure code quality, type safety, and optimal user experience.
