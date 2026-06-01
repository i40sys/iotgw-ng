---
name: shadcn-ui
description: This skill provides guidance for using Shadcn/UI components, including component patterns, customization, accessibility features, and integration with Radix UI primitives. Use when building or customizing UI components.
---

# Shadcn/UI Components

A collection of beautifully designed, accessible components built on Radix UI primitives with Tailwind CSS styling.

## Context7 Library IDs

For up-to-date documentation:
- `/websites/ui_shadcn` - Shadcn/UI docs
- `/shadcn-ui/ui` - Component source

## Core Concepts

### Component Philosophy

Shadcn/UI is not a component library - it's a collection of reusable components you copy into your project. This gives you:

- Full ownership and control
- Customization without fighting abstractions
- No version lock-in

### Installation

```bash
# Initialize shadcn/ui in project
npx shadcn@latest init

# Add specific components
npx shadcn@latest add button
npx shadcn@latest add dialog
npx shadcn@latest add form
```

## Common Components

### Button

```tsx
import { Button } from "@/components/ui/button";

// Variants
<Button variant="default">Default</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

// Sizes
<Button size="default">Default</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>

// With loading state
<Button disabled={isLoading}>
  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  Submit
</Button>

// As child (renders as different element)
<Button asChild>
  <Link href="/dashboard">Dashboard</Link>
</Button>
```

### Input

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

<div className="grid gap-3">
  <Label htmlFor="email">Email</Label>
  <Input
    id="email"
    type="email"
    placeholder="Enter email"
    className="w-full"
  />
</div>

// With icon
<div className="relative">
  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
  <Input placeholder="Search..." className="pl-8" />
</div>
```

### Dialog

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

function EditDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Edit Profile</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Make changes to your profile here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" defaultValue="John Doe" />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={() => setOpen(false)}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### AlertDialog (Confirmation)

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone. This will permanently delete your
        account and remove your data from our servers.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Form Integration

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "user"]),
  notifications: z.boolean(),
});

function SettingsForm() {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      role: "user",
      notifications: false,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Text Input */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="email@example.com" {...field} />
              </FormControl>
              <FormDescription>Your email address.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Select */}
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Checkbox */}
        <FormField
          control={form.control}
          name="notifications"
          render={({ field }) => (
            <FormItem className="flex items-center gap-2">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <FormLabel className="!mt-0">Enable notifications</FormLabel>
            </FormItem>
          )}
        />

        <Button type="submit">Save</Button>
      </form>
    </Form>
  );
}
```

### Card

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description here.</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Card content goes here.</p>
  </CardContent>
  <CardFooter className="flex justify-between">
    <Button variant="outline">Cancel</Button>
    <Button>Save</Button>
  </CardFooter>
</Card>
```

### Table

```tsx
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

<Table>
  <TableCaption>A list of recent invoices.</TableCaption>
  <TableHeader>
    <TableRow>
      <TableHead>Invoice</TableHead>
      <TableHead>Status</TableHead>
      <TableHead className="text-right">Amount</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {invoices.map((invoice) => (
      <TableRow key={invoice.id}>
        <TableCell className="font-medium">{invoice.id}</TableCell>
        <TableCell>{invoice.status}</TableCell>
        <TableCell className="text-right">{invoice.amount}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### Badge

```tsx
import { Badge } from "@/components/ui/badge";

<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Destructive</Badge>
<Badge variant="outline">Outline</Badge>
```

### Toast (Sonner)

```tsx
import { toast } from "sonner";

// In your component
toast.success("Changes saved successfully");
toast.error("Failed to save changes");
toast.info("Please wait...");

// With action
toast("Event created", {
  action: {
    label: "Undo",
    onClick: () => undoAction(),
  },
});

// With promise
toast.promise(saveChanges(), {
  loading: "Saving...",
  success: "Changes saved!",
  error: "Failed to save",
});
```

### Sheet (Side Panel)

```tsx
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

<Sheet>
  <SheetTrigger asChild>
    <Button variant="outline">Open</Button>
  </SheetTrigger>
  <SheetContent side="right"> {/* "left" | "right" | "top" | "bottom" */}
    <SheetHeader>
      <SheetTitle>Edit Profile</SheetTitle>
      <SheetDescription>
        Make changes to your profile.
      </SheetDescription>
    </SheetHeader>
    <div className="py-4">
      {/* Content */}
    </div>
  </SheetContent>
</Sheet>
```

## Styling Patterns

### Using cn() Utility

```tsx
import { cn } from "@/lib/utils";

// Merge classes conditionally
<div className={cn(
  "rounded-lg border p-4",
  isActive && "border-primary bg-primary/10",
  isDisabled && "opacity-50 pointer-events-none"
)} />

// Extend component variants
interface CustomButtonProps extends ButtonProps {
  isLoading?: boolean;
}

function CustomButton({ className, isLoading, children, ...props }: CustomButtonProps) {
  return (
    <Button
      className={cn("min-w-[100px]", className)}
      disabled={isLoading}
      {...props}
    >
      {isLoading ? <Loader2 className="animate-spin" /> : children}
    </Button>
  );
}
```

### Component Composition with asChild

```tsx
// asChild passes props to child element
<Button asChild>
  <Link href="/dashboard">Go to Dashboard</Link>
</Button>

// Useful for custom wrappers
<DialogTrigger asChild>
  <Button variant="ghost" size="icon">
    <Settings className="h-4 w-4" />
  </Button>
</DialogTrigger>
```

## Accessibility Features

Shadcn/UI components include:

- Proper ARIA attributes
- Keyboard navigation
- Focus management
- Screen reader support

```tsx
// Dialog automatically manages focus
<Dialog>
  <DialogTrigger>Open</DialogTrigger>
  <DialogContent>
    {/* Focus is trapped inside */}
    {/* Escape closes dialog */}
    {/* Focus returns to trigger on close */}
  </DialogContent>
</Dialog>

// Select with keyboard navigation
<Select>
  {/* Arrow keys navigate options */}
  {/* Enter selects */}
  {/* Type to search */}
</Select>
```

## Best Practices

1. **Use semantic HTML** - Components are built on proper elements
2. **Maintain accessibility** - Don't remove ARIA attributes
3. **Use asChild for custom elements** - Preserves props and behavior
4. **Leverage cn() for styling** - Proper class merging
5. **Copy and own components** - Customize freely after installation
6. **Follow form patterns** - Use FormField for consistent structure
