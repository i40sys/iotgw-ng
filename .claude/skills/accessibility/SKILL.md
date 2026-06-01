---
name: accessibility
description: This skill provides guidance for implementing web accessibility (a11y) best practices in React applications. Use when building accessible components, fixing accessibility issues, or ensuring WCAG compliance.
---

# Accessibility Best Practices

Building web applications that are usable by everyone, including people with disabilities.

## Core Principles (POUR)

1. **Perceivable** - Information must be presentable in ways users can perceive
2. **Operable** - UI components must be operable by all users
3. **Understandable** - Information and UI operation must be understandable
4. **Robust** - Content must be robust enough for assistive technologies

## Semantic HTML

### Use Proper Elements

```tsx
// BAD: Divs for everything
<div onClick={handleClick}>Click me</div>
<div className="heading">Title</div>

// GOOD: Semantic elements
<button onClick={handleClick}>Click me</button>
<h1>Title</h1>

// Proper heading hierarchy
<h1>Page Title</h1>
  <h2>Section</h2>
    <h3>Subsection</h3>
  <h2>Another Section</h2>

// Navigation landmarks
<header>...</header>
<nav aria-label="Main navigation">...</nav>
<main>...</main>
<aside>...</aside>
<footer>...</footer>
```

### Lists and Tables

```tsx
// Lists for related items
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
</ul>

// Tables for tabular data (not layout!)
<table>
  <caption>User List</caption>
  <thead>
    <tr>
      <th scope="col">Name</th>
      <th scope="col">Email</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>John</td>
      <td>john@example.com</td>
    </tr>
  </tbody>
</table>
```

## ARIA Attributes

### Roles

```tsx
// Override semantic role when necessary
<div role="button" tabIndex={0} onClick={handleClick} onKeyDown={handleKeyDown}>
  Custom Button
</div>

// Common roles
<div role="alert">Error message</div>
<div role="status">Loading...</div>
<div role="dialog" aria-modal="true">Modal content</div>
<ul role="menu">
  <li role="menuitem">Option 1</li>
</ul>
```

### Labels and Descriptions

```tsx
// aria-label: Concise label
<button aria-label="Close dialog">
  <XIcon />
</button>

// aria-labelledby: Reference another element
<dialog aria-labelledby="dialog-title">
  <h2 id="dialog-title">Confirm Delete</h2>
</dialog>

// aria-describedby: Additional description
<input
  id="email"
  aria-describedby="email-hint email-error"
/>
<span id="email-hint">We'll never share your email</span>
<span id="email-error" role="alert">Invalid email format</span>
```

### States and Properties

```tsx
// Expanded/collapsed
<button aria-expanded={isOpen} aria-controls="menu">
  Menu
</button>
<ul id="menu" hidden={!isOpen}>...</ul>

// Selected
<li role="option" aria-selected={isSelected}>Option</li>

// Disabled
<button aria-disabled={isDisabled} disabled={isDisabled}>
  Submit
</button>

// Loading
<button aria-busy={isLoading}>
  {isLoading ? "Loading..." : "Submit"}
</button>

// Invalid
<input aria-invalid={hasError} aria-errormessage="error-id" />
```

### Live Regions

```tsx
// Polite: Announced when user is idle
<div aria-live="polite" aria-atomic="true">
  {statusMessage}
</div>

// Assertive: Announced immediately
<div aria-live="assertive" role="alert">
  {errorMessage}
</div>

// Status updates
function NotificationArea() {
  const [message, setMessage] = useState("");

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
```

## Keyboard Navigation

### Focus Management

```tsx
// Make non-interactive elements focusable
<div tabIndex={0}>Focusable div</div>

// Remove from tab order but keep focusable programmatically
<div tabIndex={-1} ref={divRef}>
  Programmatically focusable
</div>

// Focus on mount (modals, alerts)
function Dialog({ onClose }: DialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  return (
    <div role="dialog" aria-modal="true">
      <button ref={closeButtonRef} onClick={onClose}>
        Close
      </button>
    </div>
  );
}
```

### Keyboard Handlers

```tsx
// Handle Enter and Space for custom buttons
function CustomButton({ onClick, children }: CustomButtonProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

// Escape to close
useEffect(() => {
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  document.addEventListener("keydown", handleEscape);
  return () => document.removeEventListener("keydown", handleEscape);
}, [onClose]);
```

### Focus Trap

```tsx
import { useEffect, useRef } from "react";

function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive) return;

    const container = containerRef.current;
    if (!container) return;

    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    firstElement?.focus();

    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [isActive]);

  return containerRef;
}
```

## Forms

### Labels

```tsx
// Explicit label association
<label htmlFor="email">Email</label>
<input id="email" type="email" />

// Implicit label (wrapping)
<label>
  Email
  <input type="email" />
</label>

// Hidden label for screen readers
<label htmlFor="search" className="sr-only">Search</label>
<input id="search" type="search" placeholder="Search..." />
```

### Error Handling

```tsx
function FormField({ label, error, ...props }: FormFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;

  return (
    <div>
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      {error && (
        <span id={errorId} role="alert" className="text-red-500">
          {error}
        </span>
      )}
    </div>
  );
}
```

### Required Fields

```tsx
<label htmlFor="name">
  Name <span aria-hidden="true">*</span>
  <span className="sr-only">(required)</span>
</label>
<input id="name" required aria-required="true" />
```

## Images and Media

### Alt Text

```tsx
// Informative images
<img src="/chart.png" alt="Sales increased 50% from Q1 to Q2" />

// Decorative images
<img src="/decoration.png" alt="" aria-hidden="true" />

// Complex images
<figure>
  <img src="/diagram.png" alt="System architecture" aria-describedby="diagram-desc" />
  <figcaption id="diagram-desc">
    The diagram shows the flow from client to server...
  </figcaption>
</figure>

// Icons with meaning
<button aria-label="Delete item">
  <TrashIcon aria-hidden="true" />
</button>

// Icons as decoration
<button>
  <DownloadIcon aria-hidden="true" />
  <span>Download</span>
</button>
```

## Color and Contrast

### Contrast Requirements

```css
/* WCAG AA minimum contrast ratios */
/* Normal text: 4.5:1 */
/* Large text (18px+ or 14px+ bold): 3:1 */
/* UI components: 3:1 */

/* Don't rely on color alone */
.error {
  color: #dc2626; /* Red */
  /* Also add icon or text indicator */
}
```

### Focus Indicators

```css
/* Never remove focus outline without replacement */
/* BAD */
button:focus {
  outline: none;
}

/* GOOD */
button:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

/* Tailwind */
.focus-visible:outline-none .focus-visible:ring-2 .focus-visible:ring-primary
```

## Screen Reader Only Content

```css
/* Visually hidden but accessible to screen readers */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

```tsx
// Skip link
<a href="#main-content" className="sr-only focus:not-sr-only">
  Skip to main content
</a>

// Context for screen readers
<span className="sr-only">Current page:</span>
<span>Home</span>

// Announce changes
<div aria-live="polite" className="sr-only">
  {items.length} items in cart
</div>
```

## Testing

### Manual Testing

1. **Keyboard only**: Navigate without mouse
2. **Screen reader**: Test with VoiceOver/NVDA
3. **Zoom**: Test at 200% zoom
4. **Color blindness**: Use simulation tools

### Automated Testing

```typescript
// eslint-plugin-jsx-a11y
// .eslintrc.js
module.exports = {
  extends: ["plugin:jsx-a11y/recommended"],
};

// axe-core with Vitest
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

test("should have no accessibility violations", async () => {
  const { container } = render(<MyComponent />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### Browser DevTools

- Chrome: Lighthouse accessibility audit
- Firefox: Accessibility Inspector
- Safari: Accessibility audit

## Radix UI Accessibility

Shadcn/UI components (built on Radix) include accessibility:

```tsx
// Dialog - Focus trap, Escape to close, aria attributes
<Dialog>
  <DialogTrigger>Open</DialogTrigger>
  <DialogContent>
    {/* Automatically handles focus management */}
  </DialogContent>
</Dialog>

// Select - Keyboard navigation, screen reader support
<Select>
  <SelectTrigger>
    <SelectValue placeholder="Select..." />
  </SelectTrigger>
  <SelectContent>
    {/* Arrow keys, type-ahead, proper ARIA */}
  </SelectContent>
</Select>
```

## Checklist

### Structure
- [ ] Proper heading hierarchy (h1 → h2 → h3)
- [ ] Landmark regions (header, nav, main, footer)
- [ ] Skip link for keyboard users
- [ ] Page has descriptive title

### Forms
- [ ] All inputs have associated labels
- [ ] Required fields are indicated
- [ ] Error messages are linked to inputs
- [ ] Form submission errors are announced

### Interactive Elements
- [ ] All interactive elements are focusable
- [ ] Focus order is logical
- [ ] Focus indicators are visible
- [ ] Custom components have proper ARIA

### Content
- [ ] Images have alt text (or empty for decorative)
- [ ] Color is not the only indicator
- [ ] Text has sufficient contrast
- [ ] Content is readable at 200% zoom
