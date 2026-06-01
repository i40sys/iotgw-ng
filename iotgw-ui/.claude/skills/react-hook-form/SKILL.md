---
name: react-hook-form
description: This skill provides guidance for building forms with React Hook Form, including validation with Zod resolver, form state management, and integration with UI components. Use when creating or modifying forms in React applications.
---

# React Hook Form

Performant, flexible, and extensible forms with easy-to-use validation.

## Context7 Library IDs

For up-to-date documentation:
- `/react-hook-form/documentation` - Official docs
- `/react-hook-form/resolvers` - Validation resolvers

## Installation

```bash
pnpm add react-hook-form @hookform/resolvers zod
```

## Basic Usage

### Simple Form

```typescript
import { useForm } from "react-hook-form";

interface FormData {
  email: string;
  password: string;
}

function LoginForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    console.log(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("email", { required: "Email is required" })} />
      {errors.email && <span>{errors.email.message}</span>}

      <input
        type="password"
        {...register("password", { required: "Password is required" })}
      />
      {errors.password && <span>{errors.password.message}</span>}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Submitting..." : "Submit"}
      </button>
    </form>
  );
}
```

### With Zod Validation

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  age: z.number().min(18, "Must be at least 18"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain uppercase letter")
    .regex(/[0-9]/, "Must contain number"),
});

type FormData = z.infer<typeof schema>;

function RegistrationForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      age: 18,
      password: "",
    },
  });

  return (
    <form onSubmit={handleSubmit((data) => console.log(data))}>
      <input {...register("name")} />
      {errors.name && <span>{errors.name.message}</span>}

      <input {...register("email")} />
      {errors.email && <span>{errors.email.message}</span>}

      <input {...register("age", { valueAsNumber: true })} type="number" />
      {errors.age && <span>{errors.age.message}</span>}

      <input {...register("password")} type="password" />
      {errors.password && <span>{errors.password.message}</span>}

      <button type="submit">Register</button>
    </form>
  );
}
```

## Form State

```typescript
const {
  formState: {
    errors,        // Validation errors
    isDirty,       // Form has been modified
    isValid,       // Form passes validation
    isSubmitting,  // Form is being submitted
    isSubmitted,   // Form has been submitted
    dirtyFields,   // Object of modified fields
    touchedFields, // Object of touched fields
    submitCount,   // Number of submit attempts
  },
} = useForm<FormData>({
  mode: "onChange", // Validation mode: "onSubmit" | "onChange" | "onBlur" | "onTouched" | "all"
});
```

## useForm Options

```typescript
const form = useForm<FormData>({
  // Validation mode
  mode: "onSubmit",
  reValidateMode: "onChange",

  // Default values
  defaultValues: {
    name: "",
    email: "",
  },

  // Or async default values
  defaultValues: async () => {
    const user = await fetchUser();
    return { name: user.name, email: user.email };
  },

  // Validation resolver
  resolver: zodResolver(schema),

  // Criteria mode for error display
  criteriaMode: "all", // "firstError" | "all"

  // Should unregister fields when unmounted
  shouldUnregister: false,

  // Delay validation
  delayError: 500,
});
```

## Field Registration

```typescript
// Basic registration
<input {...register("fieldName")} />

// With validation rules (without resolver)
<input
  {...register("email", {
    required: "Email is required",
    pattern: {
      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
      message: "Invalid email",
    },
  })}
/>

// With value transformation
<input
  {...register("age", {
    valueAsNumber: true,   // Convert to number
    valueAsDate: true,     // Convert to date
    setValueAs: (v) => v.trim(), // Custom transformation
  })}
/>

// Disabled field
<input {...register("disabled")} disabled />
```

## Form Methods

```typescript
const {
  register,
  handleSubmit,
  watch,
  setValue,
  getValues,
  reset,
  setError,
  clearErrors,
  trigger,
  control,
} = useForm<FormData>();

// Watch field changes
const email = watch("email");
const allValues = watch();
const [email, password] = watch(["email", "password"]);

// Set value programmatically
setValue("email", "new@example.com");
setValue("email", "new@example.com", {
  shouldValidate: true,
  shouldDirty: true,
  shouldTouch: true,
});

// Get current values
const values = getValues();
const email = getValues("email");

// Reset form
reset(); // Reset to default values
reset({ email: "reset@example.com" }); // Reset to specific values

// Set error manually
setError("email", {
  type: "manual",
  message: "Email already exists",
});

// Clear errors
clearErrors("email");
clearErrors(["email", "password"]);
clearErrors(); // Clear all

// Trigger validation
await trigger("email"); // Single field
await trigger(["email", "password"]); // Multiple fields
await trigger(); // All fields
```

## Controller for Controlled Components

For components that don't expose ref (like custom UI libraries):

```typescript
import { useForm, Controller } from "react-hook-form";
import { Select, DatePicker } from "your-ui-library";

function Form() {
  const { control, handleSubmit } = useForm<FormData>();

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        name="country"
        control={control}
        rules={{ required: "Country is required" }}
        render={({ field, fieldState: { error } }) => (
          <>
            <Select
              {...field}
              options={countries}
              onChange={(option) => field.onChange(option.value)}
            />
            {error && <span>{error.message}</span>}
          </>
        )}
      />

      <Controller
        name="birthDate"
        control={control}
        render={({ field }) => (
          <DatePicker
            selected={field.value}
            onChange={field.onChange}
          />
        )}
      />
    </form>
  );
}
```

## Field Arrays

For dynamic lists of fields:

```typescript
import { useForm, useFieldArray } from "react-hook-form";

interface FormData {
  users: { name: string; email: string }[];
}

function DynamicForm() {
  const { control, register, handleSubmit } = useForm<FormData>({
    defaultValues: {
      users: [{ name: "", email: "" }],
    },
  });

  const { fields, append, remove, move, swap } = useFieldArray({
    control,
    name: "users",
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {fields.map((field, index) => (
        <div key={field.id}>
          <input {...register(`users.${index}.name`)} />
          <input {...register(`users.${index}.email`)} />
          <button type="button" onClick={() => remove(index)}>
            Remove
          </button>
        </div>
      ))}

      <button type="button" onClick={() => append({ name: "", email: "" })}>
        Add User
      </button>

      <button type="submit">Submit</button>
    </form>
  );
}
```

## Integration with Shadcn/UI

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const schema = z.object({
  username: z.string().min(2, "Username must be at least 2 characters"),
});

type FormData = z.infer<typeof schema>;

function ProfileForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { username: "" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="Enter username" {...field} />
              </FormControl>
              <FormDescription>
                This is your public display name.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Save
        </Button>
      </form>
    </Form>
  );
}
```

## Error Handling with tRPC

```typescript
import { useMutation } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";

function Form() {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const createUser = trpc.users.create.useMutation({
    onSuccess: () => {
      form.reset();
      // Navigate or show success
    },
    onError: (error) => {
      // Set server errors on form
      if (error.data?.zodError) {
        const zodError = error.data.zodError;
        Object.entries(zodError.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof FormData, {
            type: "server",
            message: messages?.[0] || "Invalid value",
          });
        });
      } else {
        form.setError("root", {
          type: "server",
          message: error.message,
        });
      }
    },
  });

  return (
    <form onSubmit={form.handleSubmit((data) => createUser.mutate(data))}>
      {/* ... fields */}
      {form.formState.errors.root && (
        <div className="text-red-500">{form.formState.errors.root.message}</div>
      )}
    </form>
  );
}
```

## Best Practices

1. **Use Zod resolver** - Type-safe validation with inference
2. **Set default values** - Prevents uncontrolled to controlled warnings
3. **Use FormField with Shadcn** - Consistent form structure
4. **Handle server errors** - Map API errors to form fields
5. **Disable submit while submitting** - Prevent double submission
6. **Use field arrays for dynamic lists** - Proper key management
