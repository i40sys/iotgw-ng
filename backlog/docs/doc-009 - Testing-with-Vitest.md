---
id: doc-009
title: Testing with Vitest
type: documentation
created_date: "2025-09-24 06:30"
---

# Testing with Vitest

## Overview

This document provides comprehensive guidelines for testing the IoT Gateway UI application using Vitest, a blazing fast unit test framework powered by Vite. It covers setup, testing patterns, commands, and best practices specific to our monorepo architecture.

## Table of Contents

1. [Why Vitest](#why-vitest)
2. [Test Setup and Configuration](#test-setup-and-configuration)
3. [Test Commands](#test-commands)
4. [Testing Patterns](#testing-patterns)
5. [Component Testing](#component-testing)
6. [API Testing](#api-testing)
7. [Integration Testing](#integration-testing)
8. [Mocking Strategies](#mocking-strategies)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

## Why Vitest

Vitest was chosen as our testing framework for several key reasons:

- **Native Vite Support**: Seamless integration with our Vite build system
- **ESM First**: Built for modern JavaScript with native ES modules
- **Fast Execution**: Leverages Vite's transformation pipeline and esbuild
- **Jest Compatible**: Familiar API for developers coming from Jest
- **Built-in TypeScript**: First-class TypeScript support without configuration
- **Component Testing**: Excellent support for React Testing Library
- **Watch Mode**: Intelligent test re-running with HMR-like experience
- **UI Mode**: Built-in UI for exploring and debugging tests

## Test Setup and Configuration

### Installation

The project already includes Vitest and related testing dependencies:

```json
// apps/app/package.json
{
  "devDependencies": {
    "vitest": "^2.1.8",
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/user-event": "^14.5.2",
    "jsdom": "^26.0.0"
  }
}
```

### Basic Configuration

Create `vitest.config.ts` in the app directory:

```typescript
// apps/app/vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/test/",
        "*.config.ts",
        "**/*.d.ts",
        "**/*.types.ts",
        "**/index.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/components": path.resolve(__dirname, "./src/components"),
      "@/hooks": path.resolve(__dirname, "./src/hooks"),
      "@/lib": path.resolve(__dirname, "./src/lib"),
      "@/routes": path.resolve(__dirname, "./src/routes"),
    },
  },
});
```

### Test Setup File

Create a setup file for global test configuration:

```typescript
// apps/app/src/test/setup.ts
import "@testing-library/jest-dom";
import { expect, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
```

## Test Commands

The project includes several test commands at different levels:

### Root Level Commands

```bash
# Run all tests in the monorepo (CI mode)
pnpm test

# Run tests with coverage
pnpm test:coverage

# Watch mode for app tests
pnpm test:watch

# Run tests with UI
pnpm test:ui

# Run app tests only
pnpm test:app

# Run backend tests only
pnpm test:backend
```

### Package Level Commands

```bash
# In apps/app directory
pnpm test          # Run tests in watch mode
pnpm test:run      # Run tests once (CI mode)
pnpm test:ui       # Open Vitest UI
pnpm test:coverage # Generate coverage report

# In apps/backend directory
pnpm test          # Run tests in watch mode
pnpm test:run      # Run tests once (CI mode)
```

## Testing Patterns

### File Naming Conventions

- **Unit Tests**: `*.test.ts(x)` or `*.spec.ts(x)`
- **Integration Tests**: `*.integration.test.ts(x)`
- **E2E Tests**: `*.e2e.test.ts(x)`
- **Test Utilities**: Place in `src/test/utils/`
- **Test Fixtures**: Place in `src/test/fixtures/`

### Directory Structure

```
apps/app/src/
├── components/
│   ├── domains/
│   │   ├── domain-list.tsx
│   │   └── domain-list.test.tsx
│   ├── networks/
│   │   ├── network-form.tsx
│   │   └── network-form.test.tsx
│   └── ui/
│       ├── button.tsx
│       └── button.test.tsx
├── hooks/
│   ├── use-domain-validation.ts
│   └── use-domain-validation.test.ts
├── test/
│   ├── setup.ts
│   ├── utils/
│   │   ├── test-wrapper.tsx
│   │   └── mock-data.ts
│   └── fixtures/
│       └── domains.ts
└── lib/
    ├── utils.ts
    └── utils.test.ts
```

## Component Testing

### Basic Component Test

```typescript
// src/components/domains/domain-list.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DomainList } from './domain-list';
import { TestWrapper } from '@/test/utils/test-wrapper';

describe('DomainList', () => {
  it('renders domain list with items', async () => {
    render(
      <TestWrapper>
        <DomainList />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Production Domain')).toBeInTheDocument();
      expect(screen.getByText('Development Domain')).toBeInTheDocument();
    });
  });

  it('handles domain creation', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <DomainList />
      </TestWrapper>
    );

    const createButton = screen.getByRole('button', { name: /create domain/i });
    await user.click(createButton);

    // Verify dialog opens
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Fill form
    const nameInput = screen.getByLabelText(/domain name/i);
    await user.type(nameInput, 'test-domain');

    // Submit
    const submitButton = screen.getByRole('button', { name: /save/i });
    await user.click(submitButton);

    // Verify success
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
```

### Testing Hooks

```typescript
// src/hooks/use-domain-validation.test.ts
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDomainValidation } from "./use-domain-validation";
import { TestWrapper } from "@/test/utils/test-wrapper";

describe("useDomainValidation", () => {
  it("validates domain name correctly", () => {
    const { result } = renderHook(() => useDomainValidation(), {
      wrapper: TestWrapper,
    });

    expect(result.current.validateName("valid-domain")).toBe(true);
    expect(result.current.validateName("Invalid Domain!")).toBe(false);
    expect(result.current.validateName("")).toBe(false);
  });

  it("validates display name correctly", () => {
    const { result } = renderHook(() => useDomainValidation(), {
      wrapper: TestWrapper,
    });

    expect(result.current.validateDisplayName("Production")).toBe(true);
    expect(result.current.validateDisplayName("")).toBe(false);
    expect(result.current.validateDisplayName("a".repeat(101))).toBe(false);
  });
});
```

### Testing with tRPC

```typescript
// src/test/utils/test-wrapper.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { api } from '@/lib/trpc';
import type { ReactNode } from 'react';

export function TestWrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const trpcClient = api.createClient({
    links: [
      // Mock link for testing
    ],
  });

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </api.Provider>
  );
}
```

## API Testing

### Testing tRPC Procedures

```typescript
// apps/backend/src/routers/domains.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { domainsRouter } from "./domains";
import { createTestContext } from "../test/utils";
import type { Domain } from "@iotgw/supabase-contract";

vi.mock("@supabase/supabase-js");

describe("domainsRouter", () => {
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    ctx = createTestContext();
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("returns list of domains", async () => {
      const mockDomains: Domain[] = [
        {
          id: "1",
          name: "test-domain",
          display_name: "Test Domain",
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
        },
      ];

      ctx.supabase.from.mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: mockDomains,
          error: null,
        }),
      });

      const result = await domainsRouter.list(ctx);

      expect(result).toEqual(mockDomains);
      expect(ctx.supabase.from).toHaveBeenCalledWith("domains");
    });

    it("handles database errors", async () => {
      ctx.supabase.from.mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Database error" },
        }),
      });

      await expect(domainsRouter.list(ctx)).rejects.toThrow(
        "INTERNAL_SERVER_ERROR",
      );
    });
  });

  describe("create", () => {
    it("creates a new domain", async () => {
      const input = {
        name: "new-domain",
        display_name: "New Domain",
      };

      const created = {
        ...input,
        id: "2",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
      };

      ctx.supabase.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            data: [created],
            error: null,
          }),
        }),
      });

      const result = await domainsRouter.create({ ...ctx, input });

      expect(result).toEqual(created);
    });
  });
});
```

## Integration Testing

### Testing Component with API

```typescript
// src/components/domains/domain-list.integration.test.tsx
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { rest } from 'msw';
import { DomainList } from './domain-list';
import { IntegrationTestWrapper } from '@/test/utils/integration-wrapper';

const server = setupServer(
  rest.get('/api/trpc/domains.list', (req, res, ctx) => {
    return res(
      ctx.json({
        result: {
          data: [
            {
              id: '1',
              name: 'prod',
              display_name: 'Production',
              created_at: '2024-01-01',
              updated_at: '2024-01-01',
            },
          ],
        },
      })
    );
  })
);

beforeAll(() => server.listen());
afterAll(() => server.close());

describe('DomainList Integration', () => {
  it('fetches and displays real data', async () => {
    render(
      <IntegrationTestWrapper>
        <DomainList />
      </IntegrationTestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Production')).toBeInTheDocument();
    });
  });
});
```

## Mocking Strategies

### Mocking Supabase

```typescript
// src/test/mocks/supabase.ts
import { vi } from "vitest";

export const createMockSupabaseClient = () => ({
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockReturnThis(),
  rpc: vi.fn(),
});

// Usage in tests
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => createMockSupabaseClient(),
}));
```

### Mocking tRPC

```typescript
// src/test/mocks/trpc.ts
import { vi } from "vitest";

export const mockTRPCClient = {
  domains: {
    list: {
      useQuery: vi.fn(() => ({
        data: [],
        isLoading: false,
        error: null,
      })),
    },
    create: {
      useMutation: vi.fn(() => ({
        mutate: vi.fn(),
        isLoading: false,
      })),
    },
  },
};

vi.mock("@/lib/trpc", () => ({
  api: mockTRPCClient,
}));
```

### Mocking i18n

```typescript
// src/test/mocks/i18n.ts
import { vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: "en",
      changeLanguage: vi.fn(),
    },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}));
```

## Best Practices

### 1. Test Structure

Follow the AAA pattern (Arrange, Act, Assert):

```typescript
it("should update domain name", async () => {
  // Arrange
  const domain = createMockDomain();
  const newName = "updated-domain";

  // Act
  const result = await updateDomain(domain.id, { name: newName });

  // Assert
  expect(result.name).toBe(newName);
});
```

### 2. Test Isolation

Each test should be independent:

```typescript
beforeEach(() => {
  // Reset all mocks
  vi.clearAllMocks();

  // Reset database state if needed
  resetDatabase();
});

afterEach(() => {
  // Cleanup
  cleanup();
});
```

### 3. Descriptive Test Names

Use clear, descriptive test names:

```typescript
describe("DomainForm", () => {
  it("displays validation error when domain name contains special characters", async () => {
    // Test implementation
  });

  it("disables submit button while form is submitting", async () => {
    // Test implementation
  });
});
```

### 4. Testing User Interactions

Always use userEvent for simulating user interactions:

```typescript
import userEvent from "@testing-library/user-event";

it("handles form submission", async () => {
  const user = userEvent.setup();

  // Prefer userEvent over fireEvent
  await user.click(submitButton);
  await user.type(input, "test value");
  await user.selectOptions(select, "option1");
});
```

### 5. Avoid Implementation Details

Test behavior, not implementation:

```typescript
// Bad - testing implementation
expect(component.state.isOpen).toBe(true);

// Good - testing behavior
expect(screen.getByRole("dialog")).toBeInTheDocument();
```

### 6. Use Data-TestId Sparingly

Prefer accessible queries:

```typescript
// Preferred queries (in order)
screen.getByRole("button", { name: /submit/i });
screen.getByLabelText(/email/i);
screen.getByPlaceholderText(/search/i);
screen.getByText(/welcome/i);
screen.getByDisplayValue("current value");
screen.getByAltText(/profile/i);
screen.getByTitle("Close");

// Use data-testid as last resort
screen.getByTestId("complex-component");
```

### 7. Mock at the Right Level

Mock at the boundary of your application:

```typescript
// Good - mock at API boundary
vi.mock("@/lib/api", () => ({
  fetchDomains: vi.fn(),
}));

// Avoid - mocking internal implementation
vi.mock("./internal-helper", () => ({
  processData: vi.fn(),
}));
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Module Resolution Errors

```typescript
// vitest.config.ts
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
    // Add other aliases as needed
  },
}
```

#### 2. TypeScript Errors in Tests

```json
// tsconfig.json
{
  "compilerOptions": {
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  }
}
```

#### 3. Async Test Timeouts

```typescript
// Increase timeout for specific test
it('handles slow operation', async () => {
  // Test code
}, { timeout: 10000 });

// Or globally in vitest.config.ts
test: {
  testTimeout: 10000,
}
```

#### 4. React Hook Errors

Always wrap hooks in renderHook:

```typescript
import { renderHook, act } from "@testing-library/react";

const { result } = renderHook(() => useCustomHook(), {
  wrapper: TestWrapper,
});

act(() => {
  result.current.someMethod();
});
```

#### 5. Coverage Not Working

Ensure coverage configuration is correct:

```typescript
// vitest.config.ts
coverage: {
  enabled: true,
  provider: 'v8',
  reporter: ['text', 'lcov', 'html'],
  exclude: [
    'node_modules/**',
    'src/test/**',
    '**/*.config.ts',
  ],
}
```

## Running Tests in CI

For continuous integration, use the run mode:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: pnpm test:run

- name: Generate coverage
  run: pnpm test:coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

## Conclusion

Vitest provides a modern, fast, and developer-friendly testing experience for our IoT Gateway UI application. By following these patterns and best practices, we ensure our codebase remains reliable, maintainable, and well-tested.

For more information:

- [Vitest Documentation](https://vitest.dev)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro)
- [Testing Best Practices](./doc-002%20-%20Testing-Strategies-and-Patterns.md)
