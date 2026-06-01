---
name: test-driven-development
description: This skill provides guidance for test-driven development (TDD) workflow, including the RED-GREEN-REFACTOR cycle, writing effective tests first, and systematic debugging patterns. Use when implementing new features or fixing bugs with a test-first approach.
---

# Test-Driven Development (TDD)

A development methodology where tests are written before implementation code, following the RED-GREEN-REFACTOR cycle.

## The TDD Cycle

### 1. RED: Write a Failing Test

Write a test that describes the desired behavior before writing any implementation code.

```typescript
// Starting with a failing test
describe("UserService", () => {
  it("should create a user with valid email", async () => {
    const service = new UserService();

    const user = await service.create({
      email: "test@example.com",
      name: "Test User",
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe("test@example.com");
    expect(user.name).toBe("Test User");
    expect(user.createdAt).toBeInstanceOf(Date);
  });
});
```

**Key principles:**
- Test should fail because the code doesn't exist yet
- Write only enough test code to fail
- Failure message should be clear and descriptive

### 2. GREEN: Make It Pass

Write the minimum implementation code to make the test pass.

```typescript
// Minimal implementation to pass the test
class UserService {
  async create(input: { email: string; name: string }) {
    return {
      id: crypto.randomUUID(),
      email: input.email,
      name: input.name,
      createdAt: new Date(),
    };
  }
}
```

**Key principles:**
- Write the simplest code that passes
- Don't over-engineer or add extra features
- It's okay if the code isn't perfect yet

### 3. REFACTOR: Improve the Code

Improve the code while keeping tests green.

```typescript
// Refactored with validation and proper types
interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

interface CreateUserInput {
  email: string;
  name: string;
}

class UserService {
  private validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async create(input: CreateUserInput): Promise<User> {
    if (!this.validateEmail(input.email)) {
      throw new Error("Invalid email format");
    }

    return {
      id: crypto.randomUUID(),
      email: input.email.toLowerCase(),
      name: input.name.trim(),
      createdAt: new Date(),
    };
  }
}
```

**Key principles:**
- Tests must still pass after refactoring
- Improve structure, naming, performance
- Remove duplication

## TDD Workflow in Practice

### Step 1: Understand Requirements

Before writing tests, clearly define:
- What input does the feature accept?
- What output should it produce?
- What are the edge cases?
- What errors should it handle?

### Step 2: Write Test Cases List

```typescript
describe("calculateDiscount", () => {
  // Happy path tests
  it.todo("should apply 10% discount for orders over $100");
  it.todo("should apply 20% discount for orders over $200");
  it.todo("should apply no discount for orders under $100");

  // Edge cases
  it.todo("should handle exactly $100 order");
  it.todo("should round to 2 decimal places");

  // Error cases
  it.todo("should throw for negative amounts");
  it.todo("should throw for non-numeric input");
});
```

### Step 3: Implement One Test at a Time

```typescript
// Test 1: RED
it("should apply 10% discount for orders over $100", () => {
  const result = calculateDiscount(150);
  expect(result).toBe(135); // 150 - 15 = 135
});

// Implementation: GREEN
function calculateDiscount(amount: number): number {
  if (amount > 100) {
    return amount * 0.9;
  }
  return amount;
}

// Test 2: RED
it("should apply 20% discount for orders over $200", () => {
  const result = calculateDiscount(250);
  expect(result).toBe(200); // 250 - 50 = 200
});

// Updated Implementation: GREEN
function calculateDiscount(amount: number): number {
  if (amount > 200) {
    return amount * 0.8;
  }
  if (amount > 100) {
    return amount * 0.9;
  }
  return amount;
}

// REFACTOR
interface DiscountTier {
  threshold: number;
  rate: number;
}

const DISCOUNT_TIERS: DiscountTier[] = [
  { threshold: 200, rate: 0.8 },
  { threshold: 100, rate: 0.9 },
];

function calculateDiscount(amount: number): number {
  for (const tier of DISCOUNT_TIERS) {
    if (amount > tier.threshold) {
      return Math.round(amount * tier.rate * 100) / 100;
    }
  }
  return amount;
}
```

## Testing Patterns

### Arrange-Act-Assert (AAA)

```typescript
it("should update user name", async () => {
  // Arrange: Set up test data and dependencies
  const user = await createTestUser({ name: "Old Name" });
  const service = new UserService(mockDb);

  // Act: Execute the code being tested
  const updated = await service.updateName(user.id, "New Name");

  // Assert: Verify the results
  expect(updated.name).toBe("New Name");
  expect(updated.updatedAt).not.toEqual(user.updatedAt);
});
```

### Given-When-Then (BDD Style)

```typescript
describe("ShoppingCart", () => {
  describe("given an empty cart", () => {
    describe("when adding an item", () => {
      it("then cart should contain one item", () => {
        const cart = new ShoppingCart();
        cart.add({ id: "1", name: "Book", price: 10 });
        expect(cart.items).toHaveLength(1);
      });

      it("then total should equal item price", () => {
        const cart = new ShoppingCart();
        cart.add({ id: "1", name: "Book", price: 10 });
        expect(cart.total).toBe(10);
      });
    });
  });
});
```

### Test Doubles

```typescript
// Stub: Returns predetermined values
const stubDb = {
  findUser: vi.fn().mockResolvedValue({ id: "1", name: "Test" }),
};

// Mock: Verifies interactions
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};
expect(mockLogger.info).toHaveBeenCalledWith("User created");

// Spy: Wraps real implementation
const spy = vi.spyOn(emailService, "send");
await userService.create(userData);
expect(spy).toHaveBeenCalledWith(expect.objectContaining({
  to: userData.email,
}));

// Fake: Working implementation for testing
class FakeUserRepository implements UserRepository {
  private users: Map<string, User> = new Map();

  async save(user: User) {
    this.users.set(user.id, user);
    return user;
  }

  async findById(id: string) {
    return this.users.get(id) || null;
  }
}
```

## Systematic Debugging with TDD

### When a Bug is Found

1. **Write a failing test that reproduces the bug**

```typescript
it("should handle special characters in username", () => {
  // This test captures the bug
  const result = formatUsername("john.doe@company");
  expect(result).toBe("john_doe_company");
});
```

2. **Verify the test fails as expected**
3. **Fix the bug**
4. **Verify the test passes**
5. **The test now prevents regression**

### Root Cause Analysis

```typescript
describe("debugging payment processing", () => {
  // Step 1: Isolate the failing scenario
  it("fails when currency is EUR", async () => {
    const payment = { amount: 100, currency: "EUR" };
    await expect(processPayment(payment)).rejects.toThrow();
  });

  // Step 2: Narrow down the cause
  it("converts EUR to cents correctly", () => {
    expect(convertToCents(100, "EUR")).toBe(10000);
  });

  // Step 3: Test the fix
  it("processes EUR payments after fix", async () => {
    const payment = { amount: 100, currency: "EUR" };
    const result = await processPayment(payment);
    expect(result.status).toBe("completed");
  });
});
```

## TDD Best Practices

### 1. Keep Tests Fast

```typescript
// Slow: Actual database
const user = await db.users.create({ ... });

// Fast: In-memory fake
const user = await fakeUserRepo.create({ ... });
```

### 2. Test One Thing Per Test

```typescript
// Bad: Multiple assertions testing different behaviors
it("should handle user operations", () => {
  expect(createUser(validData)).toBeDefined();
  expect(() => createUser(invalidData)).toThrow();
  expect(updateUser(id, data).name).toBe(data.name);
});

// Good: Focused tests
it("should create user with valid data", () => {
  expect(createUser(validData)).toBeDefined();
});

it("should throw when creating user with invalid data", () => {
  expect(() => createUser(invalidData)).toThrow();
});
```

### 3. Use Descriptive Test Names

```typescript
// Bad
it("test1", () => { ... });
it("works", () => { ... });

// Good
it("should return empty array when no users match filter", () => { ... });
it("should throw ValidationError when email format is invalid", () => { ... });
```

### 4. Don't Test Implementation Details

```typescript
// Bad: Testing private methods
expect(service._validateEmail("test@test.com")).toBe(true);

// Good: Testing public behavior
const user = await service.create({ email: "test@test.com", name: "Test" });
expect(user.email).toBe("test@test.com");
```

### 5. Make Tests Deterministic

```typescript
// Bad: Depends on current time
expect(user.createdAt).toEqual(new Date());

// Good: Control time in tests
vi.setSystemTime(new Date("2024-01-01"));
expect(user.createdAt).toEqual(new Date("2024-01-01"));
```

## When to Use TDD

**Good candidates for TDD:**
- Business logic with clear requirements
- Data transformations and calculations
- API endpoints and handlers
- Utility functions
- Bug fixes

**May not need strict TDD:**
- Exploratory prototyping
- UI layout and styling
- Integration with external systems (test after)
- Performance optimizations

## TDD Checklist

Before marking a feature complete:

- [ ] All acceptance criteria have corresponding tests
- [ ] Edge cases are covered
- [ ] Error scenarios are tested
- [ ] Tests are readable and maintainable
- [ ] No test interdependencies
- [ ] Tests run in isolation
- [ ] Code has been refactored
- [ ] Documentation is updated
