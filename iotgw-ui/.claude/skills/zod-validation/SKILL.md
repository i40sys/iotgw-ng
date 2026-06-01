---
name: zod-validation
description: This skill provides guidance for schema validation with Zod. It should be used when defining validation schemas, inferring TypeScript types from schemas, creating custom validations, parsing/safeParsing data, or integrating Zod with forms and APIs.
---

# Zod Validation

This skill provides patterns for building type-safe validation schemas with Zod, enabling runtime validation with automatic TypeScript type inference.

## Purpose

To enable defining schemas once and using them for both runtime validation and compile-time type checking, ensuring data integrity throughout the application.

## When to Use

- Validating API inputs (tRPC procedures, form submissions)
- Parsing external data (API responses, user input)
- Defining shared types between client and server
- Creating reusable validation schemas
- Building type-safe form validation

## Basic Schemas

### Primitive Types

```typescript
import { z } from "zod";

// String validations
const stringSchema = z.string();
const emailSchema = z.string().email();
const urlSchema = z.string().url();
const uuidSchema = z.string().uuid();
const minMaxSchema = z.string().min(1).max(100);
const regexSchema = z.string().regex(/^[a-z]+$/);

// Number validations
const numberSchema = z.number();
const intSchema = z.number().int();
const positiveSchema = z.number().positive();
const rangeSchema = z.number().min(0).max(100);

// Boolean
const boolSchema = z.boolean();

// Date
const dateSchema = z.date();
const dateStringSchema = z.string().datetime();
```

### Object Schemas

```typescript
// Basic object
const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
  role: z.enum(["admin", "user", "guest"]),
});

// Infer TypeScript type from schema
type User = z.infer<typeof userSchema>;
// { id: string; name: string; email: string; age?: number; role: "admin" | "user" | "guest" }

// Partial (all fields optional)
const partialUserSchema = userSchema.partial();

// Pick specific fields
const userSummarySchema = userSchema.pick({ id: true, name: true });

// Omit specific fields
const createUserSchema = userSchema.omit({ id: true });

// Extend schema
const extendedUserSchema = userSchema.extend({
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

### Arrays and Records

```typescript
// Array of strings
const tagsSchema = z.array(z.string());

// Array with length constraints
const limitedArraySchema = z.array(z.string()).min(1).max(10);

// Non-empty array
const nonEmptySchema = z.array(z.string()).nonempty();

// Record (object with dynamic keys)
const recordSchema = z.record(z.string()); // Record<string, string>
const typedRecordSchema = z.record(z.string(), z.number()); // Record<string, number>
```

### Unions and Enums

```typescript
// String enum
const statusSchema = z.enum(["pending", "active", "completed"]);
type Status = z.infer<typeof statusSchema>; // "pending" | "active" | "completed"

// Native enum
enum Priority {
  Low = "low",
  Medium = "medium",
  High = "high",
}
const prioritySchema = z.nativeEnum(Priority);

// Discriminated union
const resultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("success"), data: z.unknown() }),
  z.object({ status: z.literal("error"), message: z.string() }),
]);

// Union
const stringOrNumberSchema = z.union([z.string(), z.number()]);
```

## Parsing Data

### parse vs safeParse

```typescript
const schema = z.object({
  name: z.string(),
  age: z.number(),
});

// parse - throws on invalid data
try {
  const data = schema.parse({ name: "John", age: 30 });
  console.log(data); // { name: "John", age: 30 }
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error(error.errors);
  }
}

// safeParse - returns result object
const result = schema.safeParse({ name: "John", age: "thirty" });

if (result.success) {
  console.log(result.data); // typed data
} else {
  console.error(result.error.errors);
  // [{ code: "invalid_type", expected: "number", received: "string", path: ["age"] }]
}
```

### parseAsync for Async Validation

```typescript
const asyncSchema = z.string().refine(async (val) => {
  const exists = await checkEmailExists(val);
  return !exists;
}, "Email already exists");

const result = await asyncSchema.safeParseAsync("user@example.com");
```

## Transformations

### Transform Data

```typescript
// Transform string to number
const stringToNumberSchema = z.string().transform((val) => parseInt(val, 10));

// Transform and validate
const trimmedStringSchema = z.string()
  .transform((val) => val.trim())
  .refine((val) => val.length > 0, "String cannot be empty");

// Coerce types
const coercedNumberSchema = z.coerce.number(); // "123" → 123
const coercedDateSchema = z.coerce.date(); // "2024-01-01" → Date

// Default values
const withDefaultSchema = z.string().default("unknown");
const withDefaultFnSchema = z.string().default(() => generateId());
```

### Input vs Output Types

```typescript
const transformSchema = z.string().transform((val) => val.length);

type Input = z.input<typeof transformSchema>; // string
type Output = z.output<typeof transformSchema>; // number
// z.infer is alias for z.output
```

## Custom Validations

### Refine

```typescript
// Single refinement
const passwordSchema = z.string()
  .min(8)
  .refine(
    (val) => /[A-Z]/.test(val),
    "Password must contain uppercase letter"
  )
  .refine(
    (val) => /[0-9]/.test(val),
    "Password must contain number"
  );

// Refinement with path for nested objects
const formSchema = z.object({
  password: z.string(),
  confirmPassword: z.string(),
}).refine(
  (data) => data.password === data.confirmPassword,
  {
    message: "Passwords don't match",
    path: ["confirmPassword"], // Error path
  }
);
```

### SuperRefine for Complex Validation

```typescript
const complexSchema = z.string().superRefine((val, ctx) => {
  if (val.length < 8) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Must be at least 8 characters",
    });
  }

  if (!/[A-Z]/.test(val)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Must contain uppercase letter",
    });
  }
});

// Type narrowing with superRefine
const nullableSchema = z.object({
  value: z.string().nullable(),
}).superRefine((arg, ctx): arg is { value: string } => {
  if (arg.value === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Value required",
    });
    return false;
  }
  return true;
});
```

## Integration Patterns

### tRPC Input Validation

```typescript
import { z } from "zod";
import { router, publicProcedure } from "./trpc";

const createUserInput = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["admin", "user"]).default("user"),
});

export const usersRouter = router({
  create: publicProcedure
    .input(createUserInput)
    .mutation(async ({ input }) => {
      // input is fully typed: { name: string; email: string; role: "admin" | "user" }
      return createUser(input);
    }),
});
```

### React Hook Form Integration

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const formSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password too short"),
});

type FormData = z.infer<typeof formSchema>;

function LoginForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = (data: FormData) => {
    // data is typed and validated
    console.log(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("email")} />
      {errors.email && <span>{errors.email.message}</span>}

      <input type="password" {...register("password")} />
      {errors.password && <span>{errors.password.message}</span>}

      <button type="submit">Login</button>
    </form>
  );
}
```

### Environment Variables

```typescript
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  DATABASE_URL: z.string().url(),
  API_KEY: z.string().min(1),
  PORT: z.coerce.number().default(3000),
});

// Parse and validate at startup
export const env = envSchema.parse(process.env);
```

## Error Handling

### Formatting Errors

```typescript
const result = schema.safeParse(data);

if (!result.success) {
  // Flat error object
  const flatErrors = result.error.flatten();
  // { formErrors: string[], fieldErrors: { [key]: string[] } }

  // Formatted errors
  const formattedErrors = result.error.format();
  // { _errors: string[], fieldName: { _errors: string[] } }

  // Error array
  const issues = result.error.issues;
  // [{ code, message, path, ... }]
}
```

### Custom Error Messages

```typescript
const schema = z.object({
  name: z.string({
    required_error: "Name is required",
    invalid_type_error: "Name must be a string",
  }).min(1, "Name cannot be empty"),

  age: z.number({
    required_error: "Age is required",
  }).min(0, "Age must be positive"),
});
```

## Best Practices

1. **Define schemas close to usage** - Keep validation near the boundary
2. **Reuse schema fragments** - Extract common patterns
3. **Use safeParse for user input** - Handle errors gracefully
4. **Infer types from schemas** - Single source of truth
5. **Add custom error messages** - User-friendly feedback
6. **Validate at system boundaries** - API inputs, external data

## Integration with Context7

To fetch latest Zod documentation, use:
- Library ID: `/colinhacks/zod` or `/websites/zod_dev`
- Topics: "schema validation", "type inference", "refinements"
