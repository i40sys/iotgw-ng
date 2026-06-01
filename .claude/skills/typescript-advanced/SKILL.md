---
name: typescript-advanced
description: This skill provides advanced TypeScript patterns for building type-safe applications. It should be used when working with generics, utility types, type guards, discriminated unions, mapped types, or when improving type safety in complex codebases.
---

# TypeScript Advanced

This skill provides guidance for leveraging advanced TypeScript features to build robust, type-safe applications.

## Purpose

To enable writing TypeScript code that maximizes compile-time safety, improves developer experience through better IntelliSense, and reduces runtime errors through proper typing.

## When to Use

- Defining complex generic types or functions
- Creating or using utility types (Pick, Omit, Partial, Record, etc.)
- Implementing type guards and type predicates
- Working with discriminated unions
- Building mapped or conditional types
- Inferring types from runtime values
- Constraining generic type parameters

## Core Patterns

### Utility Types

```typescript
// Pick: Select specific properties
type UserSummary = Pick<User, "id" | "name">;

// Omit: Exclude specific properties
type UserWithoutPassword = Omit<User, "password">;

// Partial: Make all properties optional
type PartialUser = Partial<User>;

// Required: Make all properties required
type RequiredUser = Required<PartialUser>;

// Record: Create object type with specific keys and value types
type UserRoles = Record<"admin" | "user" | "guest", Permission[]>;

// Readonly: Make all properties readonly
type ImmutableUser = Readonly<User>;
```

### Generic Constraints

```typescript
// Constrain generic to object with specific property
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// Constrain to types with specific method
function stringify<T extends { toString(): string }>(value: T): string {
  return value.toString();
}

// Multiple constraints
function merge<T extends object, U extends object>(a: T, b: U): T & U {
  return { ...a, ...b };
}
```

### Type Guards and Predicates

```typescript
// Type predicate function
function isString(value: unknown): value is string {
  return typeof value === "string";
}

// Discriminated union guard
interface Success { status: "success"; data: unknown }
interface Error { status: "error"; message: string }
type Result = Success | Error;

function isSuccess(result: Result): result is Success {
  return result.status === "success";
}

// Using 'in' operator for narrowing
function processValue(value: { name: string } | { title: string }) {
  if ("name" in value) {
    console.log(value.name); // TypeScript knows it has 'name'
  }
}
```

### Mapped Types

```typescript
// Create type with same keys but different value types
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

// Conditional mapped type
type NullableProperties<T> = {
  [K in keyof T]: T[K] | null;
};

// Filter keys by value type
type StringKeys<T> = {
  [K in keyof T]: T[K] extends string ? K : never;
}[keyof T];
```

### Conditional Types

```typescript
// Extract array element type
type ElementType<T> = T extends (infer E)[] ? E : never;

// Conditional return type
type ApiResponse<T> = T extends void ? { success: boolean } : { success: boolean; data: T };

// Distributive conditional type
type NonNullable<T> = T extends null | undefined ? never : T;
```

### Template Literal Types

```typescript
// Type-safe event names
type EventName = `on${Capitalize<"click" | "focus" | "blur">}`;
// Result: "onClick" | "onFocus" | "onBlur"

// Dynamic property paths
type PropPath<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends object
    ? `${Prefix}${K}` | PropPath<T[K], `${Prefix}${K}.`>
    : `${Prefix}${K}`;
}[keyof T & string];
```

### Inference with infer

```typescript
// Extract function return type
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

// Extract promise value type
type Awaited<T> = T extends Promise<infer U> ? U : T;

// Extract first argument type
type FirstArg<T> = T extends (first: infer F, ...args: any[]) => any ? F : never;
```

## Best Practices

1. **Prefer inference over annotation** - Let TypeScript infer types when possible
2. **Use `unknown` over `any`** - Forces proper type checking before use
3. **Leverage const assertions** - Use `as const` for literal types
4. **Define explicit return types for public APIs** - Improves documentation and catches errors
5. **Use branded types for type-safe IDs** - Prevent mixing different ID types

```typescript
// Branded type pattern
type UserId = string & { readonly brand: unique symbol };
type PostId = string & { readonly brand: unique symbol };

function createUserId(id: string): UserId {
  return id as UserId;
}
```

## Common Pitfalls

- Avoid excessive use of `any` - use `unknown` and narrow with type guards
- Don't rely solely on type inference for complex return types
- Beware of type widening with mutable variables
- Remember that TypeScript types are erased at runtime
- Use `satisfies` operator for type checking without widening

```typescript
// satisfies preserves literal types while ensuring type compatibility
const config = {
  port: 3000,
  host: "localhost",
} satisfies Record<string, string | number>;
// config.port is still number, not string | number
```

## Integration with Context7

To fetch latest TypeScript documentation, use:
- Library ID: `/websites/typescriptlang`
- Topics: "utility types", "generics", "type guards", "conditional types"
