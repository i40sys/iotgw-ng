---
id: doc-002
title: Testing Strategies and Patterns
type: documentation
created_date: "2025-08-24 12:26"
---

# Testing Strategies and Patterns

## Overview

This document provides comprehensive testing guidelines for the IoT Gateway UI project, covering unit testing, integration testing, and end-to-end testing strategies for the monorepo architecture with React, tRPC, and Supabase.

## Table of Contents

1. [Unit Testing Patterns for React Components](#unit-testing-patterns-for-react-components)
2. [tRPC Procedure Testing Patterns](#trpc-procedure-testing-patterns)
3. [Database Integration Testing with Supabase](#database-integration-testing-with-supabase)
4. [Frontend Integration Testing with TanStack Query](#frontend-integration-testing-with-tanstack-query)
5. [Mocking Strategies for External Dependencies](#mocking-strategies-for-external-dependencies)
6. [CI/CD Pipeline Testing Integration](#cicd-pipeline-testing-integration)

## Unit Testing Patterns for React Components

### Testing Setup

#### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

#### Test Setup File

```typescript
// src/test/setup.ts
import "@testing-library/jest-dom";
import { beforeAll, afterEach, afterAll } from "vitest";
import { cleanup } from "@testing-library/react";

// Setup global test environment
beforeAll(() => {
  // Mock window.matchMedia for theme tests
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  vi.clearAllMocks();
});
```

### Component Testing Patterns

#### Basic Component Test

```typescript
// __tests__/components/device-card.test.tsx
import { render, screen } from '@testing-library/react';
import { DeviceCard } from '@/components/device-card';
import type { Device } from '@iotgw/supabase-contract';

const mockDevice: Device = {
  id: 'test-device-1',
  hostname: 'test-device',
  ip_address: '192.168.1.100',
  mac_address: '00:11:22:33:44:55',
  os: 'Linux',
  status: 'online',
  last_seen_at: '2023-12-01T10:00:00Z',
  created_at: '2023-12-01T09:00:00Z',
};

describe('DeviceCard', () => {
  it('renders device information correctly', () => {
    render(<DeviceCard device={mockDevice} />);

    expect(screen.getByText('test-device')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.100')).toBeInTheDocument();
    expect(screen.getByText('online')).toBeInTheDocument();
  });

  it('handles missing optional fields gracefully', () => {
    const deviceWithMissingFields = {
      ...mockDevice,
      ip_address: null,
      mac_address: null,
      os: null,
    };

    render(<DeviceCard device={deviceWithMissingFields} />);

    expect(screen.getByText('No IP Address')).toBeInTheDocument();
    expect(screen.getByText('N/A')).toBeInTheDocument(); // For OS
  });

  it('applies correct status styling', () => {
    render(<DeviceCard device={mockDevice} />);

    const statusElement = screen.getByText('online');
    expect(statusElement).toHaveClass('text-green-800');
  });
});
```

#### Component with User Interactions

```typescript
// __tests__/components/device-form.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeviceForm } from '@/components/device-form';

const mockOnSubmit = vi.fn();

describe('DeviceForm', () => {
  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it('submits form with valid data', async () => {
    const user = userEvent.setup();
    render(<DeviceForm onSubmit={mockOnSubmit} />);

    await user.type(screen.getByLabelText('Hostname'), 'test-device');
    await user.type(screen.getByLabelText('IP Address'), '192.168.1.100');

    await user.click(screen.getByRole('button', { name: 'Save Device' }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        hostname: 'test-device',
        ipAddress: '192.168.1.100',
        status: 'unknown',
      });
    });
  });

  it('shows validation errors for invalid input', async () => {
    const user = userEvent.setup();
    render(<DeviceForm onSubmit={mockOnSubmit} />);

    // Try to submit empty form
    await user.click(screen.getByRole('button', { name: 'Save Device' }));

    await waitFor(() => {
      expect(screen.getByText('Hostname is required')).toBeInTheDocument();
      expect(screen.getByText('Please select a device')).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });
});
```

#### Testing Custom Hooks

```typescript
// __tests__/hooks/use-device-subscription.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDeviceSubscription } from '@/hooks/use-device-subscription';

// Mock tRPC
vi.mock('@/utils/trpc', () => ({
  trpc: {
    getDevices: {
      useQuery: vi.fn(),
    },
    subscribeToDeviceChanges: {
      subscribe: vi.fn(),
    },
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('useDeviceSubscription', () => {
  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useDeviceSubscription(), {
      wrapper: createWrapper(),
    });

    expect(result.current.devices).toEqual([]);
    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('handles device updates from subscription', async () => {
    const mockSubscription = {
      unsubscribe: vi.fn(),
    };

    const { trpc } = await import('@/utils/trpc');
    vi.mocked(trpc.subscribeToDeviceChanges.subscribe).mockReturnValue(mockSubscription);

    const { result } = renderHook(() => useDeviceSubscription(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connecting');
    });
  });
});
```

## tRPC Procedure Testing Patterns

### Backend Procedure Testing

#### Unit Testing Procedures

```typescript
// __tests__/procedures/devices.test.ts
import { createContext } from "@/context";
import { appRouter } from "@/routers/router";
import { TRPCError } from "@trpc/server";

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(),
  rpc: vi.fn(),
};

const createMockContext = (overrides = {}) => ({
  req: {} as any,
  res: {} as any,
  user: { name: "test-user" },
  supabase: mockSupabaseClient as any,
  ...overrides,
});

describe("Device procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = appRouter.createCaller(ctx);
    vi.clearAllMocks();
  });

  describe("getDevices", () => {
    it("should return devices when successful", async () => {
      const mockDevices = [
        { id: "1", hostname: "device1", status: "online" },
        { id: "2", hostname: "device2", status: "offline" },
      ];

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: mockDevices,
            error: null,
          }),
        }),
      });

      const result = await caller.getDevices();
      expect(result).toEqual(mockDevices);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("devices");
    });

    it("should throw TRPCError when database error occurs", async () => {
      const dbError = { message: "Connection failed", code: "DB_ERROR" };

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null,
            error: dbError,
          }),
        }),
      });

      await expect(caller.getDevices()).rejects.toThrow(TRPCError);
    });
  });

  describe("createDeviceLog", () => {
    it("should create device log successfully", async () => {
      const inputData = {
        hostname: "test-device",
        ipAddress: "192.168.1.100",
      };

      const mockCreatedLog = {
        id: "log-1",
        hostname: "test-device",
        ip_address: "192.168.1.100",
        created_at: "2023-12-01T10:00:00Z",
      };

      mockSupabaseClient.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockCreatedLog,
              error: null,
            }),
          }),
        }),
      });

      const result = await caller.createDeviceLog(inputData);
      expect(result).toEqual(mockCreatedLog);
    });
  });
});
```

#### Integration Testing with Real Database

```typescript
// __tests__/integration/devices.integration.test.ts
import { createClient } from "@supabase/supabase-js";
import { appRouter } from "@/routers/router";
import { createContext } from "@/context";

// Test database setup
const testSupabase = createClient(
  process.env.TEST_SUPABASE_URL!,
  process.env.TEST_SUPABASE_ANON_KEY!,
);

describe("Device Integration Tests", () => {
  let caller: any;

  beforeAll(async () => {
    // Setup test database
    await testSupabase.from("devices").delete().neq("id", "");
    await testSupabase.from("device_creation_log").delete().neq("id", "");
  });

  beforeEach(() => {
    const ctx = {
      req: {} as any,
      res: {} as any,
      user: { name: "test-user" },
      supabase: testSupabase,
    };
    caller = appRouter.createCaller(ctx);
  });

  afterEach(async () => {
    // Clean up after each test
    await testSupabase.from("devices").delete().neq("id", "");
    await testSupabase.from("device_creation_log").delete().neq("id", "");
  });

  it("should create and retrieve device log", async () => {
    // Create device log
    const createResult = await caller.createDeviceLog({
      hostname: "integration-test-device",
      ipAddress: "192.168.1.200",
    });

    expect(createResult).toHaveProperty("id");
    expect(createResult.hostname).toBe("integration-test-device");
    expect(createResult.ip_address).toBe("192.168.1.200");

    // Verify it exists in database
    const { data: logs } = await testSupabase
      .from("device_creation_log")
      .select("*")
      .eq("id", createResult.id);

    expect(logs).toHaveLength(1);
    expect(logs![0].hostname).toBe("integration-test-device");
  });
});
```

## Database Integration Testing with Supabase

### Test Database Setup

#### Environment Configuration

```bash
# .env.test
TEST_SUPABASE_URL=http://localhost:54321
TEST_SUPABASE_ANON_KEY=your-test-anon-key
TEST_SUPABASE_SERVICE_ROLE_KEY=your-test-service-role-key
```

#### Database Test Utilities

```typescript
// src/test/database-utils.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@iotgw/supabase-contract";

export const createTestClient = (): SupabaseClient<Database> => {
  return createClient<Database>(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
    },
  );
};

export const cleanupTestData = async (supabase: SupabaseClient<Database>) => {
  // Clean up test data in reverse dependency order
  await supabase.from("device_creation_log").delete().neq("id", "");
  await supabase.from("devices").delete().neq("id", "");
};

export const createTestDevice = async (
  supabase: SupabaseClient<Database>,
  overrides: Partial<Database["public"]["Tables"]["devices"]["Insert"]> = {},
) => {
  const deviceData = {
    hostname: "test-device",
    ip_address: "192.168.1.100",
    mac_address: "00:11:22:33:44:55",
    os: "Linux",
    status: "unknown" as const,
    ...overrides,
  };

  const { data, error } = await supabase
    .from("devices")
    .insert(deviceData)
    .select()
    .single();

  if (error) throw error;
  return data;
};
```

### RLS Policy Testing

```typescript
// __tests__/database/rls-policies.test.ts
import { createTestClient, cleanupTestData } from "@/test/database-utils";

describe("RLS Policies", () => {
  const supabase = createTestClient();

  afterEach(async () => {
    await cleanupTestData(supabase);
  });

  describe("devices table policies", () => {
    it("allows authenticated users to read devices", async () => {
      // Create test device
      const { data: device } = await supabase
        .from("devices")
        .insert({
          hostname: "test-device",
          ip_address: "192.168.1.100",
          status: "unknown",
        })
        .select()
        .single();

      // Test read access
      const { data: devices, error } = await supabase
        .from("devices")
        .select("*")
        .eq("id", device!.id);

      expect(error).toBeNull();
      expect(devices).toHaveLength(1);
      expect(devices![0].hostname).toBe("test-device");
    });

    it("prevents unauthorized access with RLS", async () => {
      const anonClient = createClient(
        process.env.TEST_SUPABASE_URL!,
        process.env.TEST_SUPABASE_ANON_KEY!, // Using anon key
      );

      // This should be restricted by RLS policies
      const { data, error } = await anonClient.from("devices").select("*");

      // Depending on your RLS setup, this might return empty or error
      expect(data).toEqual([]);
    });
  });
});
```

## Frontend Integration Testing with TanStack Query

### Query Provider Setup

```typescript
// src/test/query-provider.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

export const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
    logger: {
      log: console.log,
      warn: console.warn,
      error: process.env.NODE_ENV === 'test' ? () => {} : console.error,
    },
  });
};

export function TestQueryProvider({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

### Testing Components with Queries

```typescript
// __tests__/components/device-list.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { DeviceList } from '@/components/device-list';
import { TestQueryProvider } from '@/test/query-provider';

// Mock tRPC
vi.mock('@/utils/trpc', () => ({
  trpc: {
    getDevices: {
      useQuery: vi.fn(),
    },
  },
}));

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <TestQueryProvider>
      {ui}
    </TestQueryProvider>
  );
};

describe('DeviceList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    const { trpc } = require('@/utils/trpc');
    trpc.getDevices.useQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    renderWithProviders(<DeviceList />);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('displays devices when data is loaded', async () => {
    const mockDevices = [
      { id: '1', hostname: 'device-1', status: 'online' },
      { id: '2', hostname: 'device-2', status: 'offline' },
    ];

    const { trpc } = require('@/utils/trpc');
    trpc.getDevices.useQuery.mockReturnValue({
      data: mockDevices,
      isLoading: false,
      error: null,
    });

    renderWithProviders(<DeviceList />);

    await waitFor(() => {
      expect(screen.getByText('device-1')).toBeInTheDocument();
      expect(screen.getByText('device-2')).toBeInTheDocument();
    });
  });

  it('shows error state when query fails', async () => {
    const { trpc } = require('@/utils/trpc');
    trpc.getDevices.useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to fetch devices'),
    });

    renderWithProviders(<DeviceList />);

    await waitFor(() => {
      expect(screen.getByText(/failed to fetch devices/i)).toBeInTheDocument();
    });
  });
});
```

### Testing Mutations

```typescript
// __tests__/components/device-status-toggle.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeviceStatusToggle } from '@/components/device-status-toggle';
import { TestQueryProvider } from '@/test/query-provider';

const mockMutate = vi.fn();
const mockInvalidateQueries = vi.fn();

vi.mock('@/utils/trpc', () => ({
  trpc: {
    updateDeviceStatus: {
      useMutation: vi.fn(),
    },
    useUtils: () => ({
      getDevices: {
        invalidate: mockInvalidateQueries,
      },
    }),
  },
}));

const mockDevice = {
  id: 'device-1',
  hostname: 'test-device',
  status: 'offline' as const,
};

describe('DeviceStatusToggle', () => {
  beforeEach(() => {
    const { trpc } = require('@/utils/trpc');
    trpc.updateDeviceStatus.useMutation.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  it('calls mutation with correct parameters', async () => {
    const user = userEvent.setup();

    render(
      <TestQueryProvider>
        <DeviceStatusToggle device={mockDevice} />
      </TestQueryProvider>
    );

    await user.click(screen.getByRole('button', { name: /set online/i }));

    expect(mockMutate).toHaveBeenCalledWith({
      deviceId: 'device-1',
      status: 'online',
    });
  });

  it('shows loading state during mutation', () => {
    const { trpc } = require('@/utils/trpc');
    trpc.updateDeviceStatus.useMutation.mockReturnValue({
      mutate: mockMutate,
      isPending: true,
      error: null,
    });

    render(
      <TestQueryProvider>
        <DeviceStatusToggle device={mockDevice} />
      </TestQueryProvider>
    );

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });
});
```

## Mocking Strategies for External Dependencies

### Supabase Client Mocking

```typescript
// src/test/mocks/supabase.ts
export const createMockSupabaseClient = () => {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockEq = vi.fn();
  const mockSingle = vi.fn();
  const mockOrder = vi.fn();

  // Chain methods properly
  mockSelect.mockReturnValue({
    eq: mockEq,
    order: mockOrder,
    single: mockSingle,
  });
  mockInsert.mockReturnValue({ select: mockSelect, single: mockSingle });
  mockUpdate.mockReturnValue({
    eq: mockEq,
    select: mockSelect,
    single: mockSingle,
  });
  mockDelete.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ single: mockSingle, select: mockSelect });
  mockOrder.mockReturnValue({ data: [], error: null });
  mockSingle.mockReturnValue({ data: null, error: null });

  return {
    from: vi.fn(() => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    })),
    rpc: vi.fn(),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  };
};
```

### tRPC Client Mocking

```typescript
// src/test/mocks/trpc.ts
export const createMockTRPCClient = () => ({
  getDevices: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
    useInfiniteQuery: vi.fn(),
  },
  getDevice: {
    useQuery: vi.fn(),
  },
  createDeviceLog: {
    useMutation: vi.fn(),
  },
  updateDeviceStatus: {
    useMutation: vi.fn(),
  },
  subscribeToDeviceChanges: {
    subscribe: vi.fn(),
  },
  useUtils: vi.fn(() => ({
    getDevices: {
      invalidate: vi.fn(),
      setData: vi.fn(),
      getData: vi.fn(),
    },
  })),
});

// Usage in test setup
vi.mock("@/utils/trpc", () => ({
  trpc: createMockTRPCClient(),
}));
```

### WebSocket Mocking

```typescript
// src/test/mocks/websocket.ts
export class MockWebSocket {
  static instance: MockWebSocket;

  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  readyState = WebSocket.CONNECTING;

  constructor(url: string) {
    MockWebSocket.instance = this;
    // Simulate connection
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.(new Event("open"));
    }, 10);
  }

  send(data: string) {
    // Mock send implementation
    console.log("Mock WebSocket send:", data);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }

  // Helper methods for testing
  static simulateMessage(data: any) {
    if (MockWebSocket.instance) {
      MockWebSocket.instance.onmessage?.(
        new MessageEvent("message", { data: JSON.stringify(data) }),
      );
    }
  }
}

// Setup in test
beforeAll(() => {
  global.WebSocket = MockWebSocket as any;
});
```

## CI/CD Pipeline Testing Integration

### GitHub Actions Configuration

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      supabase:
        image: supabase/supabase:latest
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Setup test database
        run: |
          pnpm --filter @iotgw/supabase-contract generate:test
          pnpm build:contract

      - name: Run type checking
        run: pnpm typecheck

      - name: Run linting
        run: pnpm lint

      - name: Run unit tests
        run: pnpm test:unit
        env:
          TEST_SUPABASE_URL: http://localhost:54321
          TEST_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}

      - name: Run integration tests
        run: pnpm test:integration
        env:
          TEST_SUPABASE_URL: http://localhost:54321
          TEST_SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_ROLE_KEY }}

      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

### Test Scripts Configuration

```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run --coverage --reporter=verbose src/**/*.test.{ts,tsx}",
    "test:integration": "vitest run --coverage --reporter=verbose __tests__/integration/**/*.test.ts",
    "test:e2e": "playwright test",
    "test:watch": "vitest --ui",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Package-Specific Test Scripts

```json
// apps/app/package.json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage"
  }
}

// apps/backend/package.json
{
  "scripts": {
    "test": "vitest",
    "test:integration": "vitest run __tests__/integration/**/*.test.ts",
    "test:db": "vitest run __tests__/database/**/*.test.ts"
  }
}
```

### Coverage Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/",
        "__tests__/",
        "dist/",
        "*.config.*",
        "src/test/",
      ],
      thresholds: {
        global: {
          statements: 80,
          branches: 70,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
});
```

### Pre-commit Testing

```json
// .lintstagedrc
{
  "*.{ts,tsx}": ["eslint --fix", "vitest related --run", "prettier --write"],
  "*.{json,md,css}": ["prettier --write"]
}
```

### Test Environment Configuration

```bash
# .env.test
NODE_ENV=test
TEST_SUPABASE_URL=http://localhost:54321
TEST_SUPABASE_ANON_KEY=test-anon-key
TEST_SUPABASE_SERVICE_ROLE_KEY=test-service-role-key
VITE_BACKEND_URL=http://localhost:4444
```

### Database Migration Testing

```typescript
// __tests__/database/migrations.test.ts
import { createTestClient } from "@/test/database-utils";

describe("Database Migrations", () => {
  const supabase = createTestClient();

  it("should have all required tables", async () => {
    const { data: tables } = await supabase
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public");

    const tableNames = tables?.map((t) => t.table_name) || [];

    expect(tableNames).toContain("devices");
    expect(tableNames).toContain("device_creation_log");
  });

  it("should have correct column types", async () => {
    const { data: columns } = await supabase
      .from("information_schema.columns")
      .select("column_name, data_type")
      .eq("table_name", "devices");

    const ipColumn = columns?.find((c) => c.column_name === "ip_address");
    const macColumn = columns?.find((c) => c.column_name === "mac_address");

    expect(ipColumn?.data_type).toBe("inet");
    expect(macColumn?.data_type).toBe("macaddr");
  });
});
```

---

This comprehensive testing documentation provides a complete foundation for implementing reliable, maintainable tests across the IoT Gateway UI monorepo, ensuring code quality and system reliability.
