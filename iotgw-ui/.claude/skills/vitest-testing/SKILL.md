---
name: vitest-testing
description: This skill provides guidance for writing tests with Vitest, including configuration, mocking, React Testing Library integration, and coverage reporting. Use when creating or modifying tests for frontend or backend code.
---

# Vitest Testing Framework

A blazing fast unit test framework powered by Vite with native ESM support.

## Context7 Library IDs

For up-to-date documentation:
- `/vitest-dev/vitest` - Vitest core
- `/websites/vitest_dev` - Official website

## Configuration

### vitest.config.ts

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    // Test file patterns
    include: ["**/*.{test,spec}.{js,ts,jsx,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],

    // Environment
    environment: "jsdom", // "node" | "jsdom" | "happy-dom"
    globals: true, // Inject test APIs globally

    // Setup files
    setupFiles: ["./test/setup.ts"],

    // Coverage
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },

    // Mocking
    clearMocks: true,
    restoreMocks: true,

    // Execution
    testTimeout: 5000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### Setup File (test/setup.ts)

```typescript
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
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

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
```

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Calculator", () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  it("should add two numbers", () => {
    expect(add(2, 3)).toBe(5);
  });

  it("should handle negative numbers", () => {
    expect(add(-1, 1)).toBe(0);
  });

  describe("division", () => {
    it("should divide two numbers", () => {
      expect(divide(10, 2)).toBe(5);
    });

    it("should throw on division by zero", () => {
      expect(() => divide(10, 0)).toThrow("Division by zero");
    });
  });
});
```

### Assertions

```typescript
// Equality
expect(value).toBe(5); // Strict equality
expect(value).toEqual({ a: 1 }); // Deep equality
expect(value).toStrictEqual({ a: 1 }); // Strict deep equality

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toBeDefined();

// Numbers
expect(value).toBeGreaterThan(3);
expect(value).toBeGreaterThanOrEqual(3);
expect(value).toBeLessThan(5);
expect(value).toBeCloseTo(0.3, 5); // Floating point

// Strings
expect(value).toMatch(/pattern/);
expect(value).toContain("substring");

// Arrays and objects
expect(array).toContain(item);
expect(array).toHaveLength(3);
expect(object).toHaveProperty("key");
expect(object).toHaveProperty("nested.key", value);

// Exceptions
expect(() => fn()).toThrow();
expect(() => fn()).toThrow("message");
expect(() => fn()).toThrow(ErrorClass);

// Promises
await expect(promise).resolves.toBe(value);
await expect(promise).rejects.toThrow();

// Snapshots
expect(value).toMatchSnapshot();
expect(value).toMatchInlineSnapshot(`"expected value"`);
```

### Mocking

```typescript
import { vi, describe, it, expect } from "vitest";

// Mock function
const mockFn = vi.fn();
mockFn.mockReturnValue(42);
mockFn.mockReturnValueOnce(1);
mockFn.mockResolvedValue({ data: "async" });
mockFn.mockRejectedValue(new Error("failed"));
mockFn.mockImplementation((x) => x * 2);

// Assertions on mock
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledTimes(2);
expect(mockFn).toHaveBeenCalledWith("arg1", "arg2");
expect(mockFn).toHaveBeenLastCalledWith("lastArg");

// Spy on existing method
const spy = vi.spyOn(object, "method");
spy.mockReturnValue("mocked");

// Mock module
vi.mock("./api", () => ({
  fetchData: vi.fn().mockResolvedValue({ data: [] }),
}));

// Mock module with factory
vi.mock("./database", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    connect: vi.fn(),
  };
});

// Mock timers
vi.useFakeTimers();
vi.advanceTimersByTime(1000);
vi.runAllTimers();
vi.useRealTimers();

// Mock date
vi.setSystemTime(new Date("2024-01-01"));
```

## React Testing Library

### Component Testing

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

describe("Button", () => {
  it("should render with text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("should call onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<Button onClick={onClick}>Click me</Button>);
    await user.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should be disabled when loading", () => {
    render(<Button isLoading>Submit</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
```

### Query Priority

Use queries in this order (most to least preferred):

```typescript
// Accessible to everyone
screen.getByRole("button", { name: "Submit" });
screen.getByLabelText("Email");
screen.getByPlaceholderText("Enter email");
screen.getByText("Hello World");
screen.getByDisplayValue("current value");

// Semantic queries
screen.getByAltText("profile picture");
screen.getByTitle("Close");

// Test IDs (last resort)
screen.getByTestId("custom-element");
```

### Query Variants

```typescript
// getBy - throws if not found (synchronous)
screen.getByRole("button");

// queryBy - returns null if not found (synchronous)
screen.queryByRole("button");

// findBy - returns promise, waits for element (async)
await screen.findByRole("button");

// getAllBy, queryAllBy, findAllBy - for multiple elements
screen.getAllByRole("listitem");
```

### Async Testing

```typescript
it("should load data and display it", async () => {
  render(<UserProfile userId="123" />);

  // Wait for loading to finish
  expect(screen.getByText("Loading...")).toBeInTheDocument();

  // Wait for data to appear
  await waitFor(() => {
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  // Or use findBy
  const name = await screen.findByText("John Doe");
  expect(name).toBeInTheDocument();
});

it("should handle errors", async () => {
  server.use(
    http.get("/api/user", () => {
      return HttpResponse.json({ error: "Not found" }, { status: 404 });
    })
  );

  render(<UserProfile userId="999" />);

  await waitFor(() => {
    expect(screen.getByText("Error: Not found")).toBeInTheDocument();
  });
});
```

### Testing Forms

```typescript
it("should submit form with valid data", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();

  render(<LoginForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText("Email"), "test@example.com");
  await user.type(screen.getByLabelText("Password"), "password123");
  await user.click(screen.getByRole("button", { name: "Submit" }));

  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "password123",
    });
  });
});

it("should show validation errors", async () => {
  const user = userEvent.setup();

  render(<LoginForm />);

  await user.click(screen.getByRole("button", { name: "Submit" }));

  await waitFor(() => {
    expect(screen.getByText("Email is required")).toBeInTheDocument();
  });
});
```

## Mocking HTTP Requests with MSW

```typescript
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { beforeAll, afterAll, afterEach } from "vitest";

const handlers = [
  http.get("/api/users", () => {
    return HttpResponse.json([
      { id: 1, name: "John" },
      { id: 2, name: "Jane" },
    ]);
  }),

  http.post("/api/users", async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: 3, ...body }, { status: 201 });
  }),

  http.get("/api/users/:id", ({ params }) => {
    return HttpResponse.json({ id: params.id, name: "John" });
  }),
];

const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

// Override handler for specific test
it("should handle error", async () => {
  server.use(
    http.get("/api/users", () => {
      return HttpResponse.json({ error: "Server error" }, { status: 500 });
    })
  );

  // Test error handling...
});
```

## Testing tRPC Procedures

```typescript
import { describe, it, expect } from "vitest";
import { createCallerFactory } from "@trpc/server";
import { appRouter } from "../routers";
import { createTestContext } from "../test-utils";

const createCaller = createCallerFactory(appRouter);

describe("users router", () => {
  it("should create a user", async () => {
    const ctx = await createTestContext();
    const caller = createCaller(ctx);

    const user = await caller.users.create({
      email: "test@example.com",
      name: "Test User",
    });

    expect(user).toMatchObject({
      email: "test@example.com",
      name: "Test User",
    });
  });

  it("should throw on invalid input", async () => {
    const ctx = await createTestContext();
    const caller = createCaller(ctx);

    await expect(
      caller.users.create({ email: "invalid", name: "" })
    ).rejects.toThrow();
  });
});
```

## Running Tests

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test --watch

# Run specific file
pnpm test src/components/Button.test.tsx

# Run with coverage
pnpm test --coverage

# Update snapshots
pnpm test -u
```

## Best Practices

1. **Test behavior, not implementation** - Focus on user interactions
2. **Use accessible queries** - getByRole, getByLabelText first
3. **Avoid test IDs** - Use them only as last resort
4. **Mock at boundaries** - HTTP, timers, not internal modules
5. **Keep tests isolated** - Each test should be independent
6. **Use setup files** - Common configuration in one place
7. **Write meaningful assertions** - Clear failure messages
