---
name: tailwind-css-v4
description: This skill provides guidance for styling applications with Tailwind CSS v4. It should be used when implementing utility-first styling, configuring themes, setting up dark mode, using CSS variables, creating custom variants, or migrating from v3 to v4.
---

# Tailwind CSS v4

This skill provides patterns for building modern, responsive UIs with Tailwind CSS v4's utility-first approach.

## Purpose

To enable rapid, consistent UI development using Tailwind CSS v4's utility classes, theme system, and dark mode support.

## When to Use

- Styling components with utility classes
- Configuring theme colors and variables
- Implementing light/dark mode
- Creating responsive layouts
- Building custom component variants
- Migrating from Tailwind v3 to v4

## Core Setup

### CSS Entry Point

```css
/* src/styles.css */
@import "tailwindcss";

/* Theme configuration using CSS variables */
@theme {
  /* Colors using OKLCH for better color manipulation */
  --color-primary: oklch(0.65 0.19 252);
  --color-secondary: oklch(0.75 0.12 200);
  --color-accent: oklch(0.70 0.18 150);

  /* Semantic colors */
  --color-success: oklch(0.72 0.19 142);
  --color-warning: oklch(0.80 0.18 84);
  --color-error: oklch(0.65 0.22 25);

  /* Spacing scale */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;

  /* Border radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 1rem;
  --radius-full: 9999px;
}

/* Custom dark mode variant using class */
@custom-variant dark (&:where(.dark, .dark *));
```

## Dark Mode

### Class-Based Dark Mode

```css
/* Enable class-based dark mode */
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));
```

```html
<!-- Toggle dark class on html element -->
<html class="dark">
  <body>
    <div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
      Content adapts to theme
    </div>
  </body>
</html>
```

### Dark Mode with JavaScript

```typescript
// Toggle dark mode
function toggleDarkMode() {
  document.documentElement.classList.toggle("dark");

  // Persist preference
  const isDark = document.documentElement.classList.contains("dark");
  localStorage.theme = isDark ? "dark" : "light";
}

// Initialize from preference
function initTheme() {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const storedTheme = localStorage.theme;

  if (storedTheme === "dark" || (!storedTheme && prefersDark)) {
    document.documentElement.classList.add("dark");
  }
}
```

### Dark Mode Patterns

```html
<!-- Background and text -->
<div class="bg-white dark:bg-gray-800">
  <h1 class="text-gray-900 dark:text-white">Title</h1>
  <p class="text-gray-600 dark:text-gray-300">Description</p>
</div>

<!-- Borders and shadows -->
<div class="border border-gray-200 dark:border-gray-700
            shadow-lg dark:shadow-none">
  Card content
</div>

<!-- Interactive states with dark mode -->
<button class="bg-blue-500 hover:bg-blue-600
               dark:bg-blue-600 dark:hover:bg-blue-700">
  Button
</button>
```

## Utility Patterns

### Layout

```html
<!-- Flexbox -->
<div class="flex items-center justify-between gap-4">
  <div class="flex-1">Flexible</div>
  <div class="flex-shrink-0">Fixed</div>
</div>

<!-- Grid -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</div>

<!-- Container with max-width -->
<div class="container mx-auto px-4 max-w-7xl">
  Centered content
</div>
```

### Spacing

```html
<!-- Padding -->
<div class="p-4">All sides</div>
<div class="px-4 py-2">Horizontal and vertical</div>
<div class="pt-4 pb-2">Top and bottom</div>

<!-- Margin -->
<div class="m-4">All sides</div>
<div class="mx-auto">Center horizontally</div>
<div class="mt-8 mb-4">Top and bottom</div>

<!-- Gap (for flex/grid) -->
<div class="flex gap-4">Consistent spacing</div>
```

### Typography

```html
<!-- Font sizes -->
<h1 class="text-4xl font-bold">Heading 1</h1>
<h2 class="text-2xl font-semibold">Heading 2</h2>
<p class="text-base">Body text</p>
<small class="text-sm text-gray-500">Small text</small>

<!-- Text alignment and color -->
<p class="text-center text-gray-700 dark:text-gray-300">
  Centered paragraph
</p>

<!-- Line height and letter spacing -->
<p class="leading-relaxed tracking-wide">
  Comfortable reading text
</p>
```

### Borders and Rounded Corners

```html
<!-- Borders -->
<div class="border border-gray-200">Default border</div>
<div class="border-2 border-blue-500">Thick colored border</div>
<div class="border-t border-gray-200">Top border only</div>

<!-- Border radius -->
<div class="rounded">Small radius</div>
<div class="rounded-lg">Large radius</div>
<div class="rounded-full">Pill shape</div>
```

### Shadows

```html
<!-- v4 shadow naming (changed from v3) -->
<div class="shadow-xs">Extra small (was shadow-sm in v3)</div>
<div class="shadow-sm">Small (was shadow in v3)</div>
<div class="shadow-md">Medium</div>
<div class="shadow-lg">Large</div>
<div class="shadow-xl">Extra large</div>

<!-- Remove shadow in dark mode -->
<div class="shadow-lg dark:shadow-none">
  Card without shadow in dark mode
</div>
```

## Responsive Design

```html
<!-- Mobile-first breakpoints -->
<div class="
  w-full          /* Mobile: full width */
  sm:w-1/2        /* >= 640px: half width */
  md:w-1/3        /* >= 768px: third width */
  lg:w-1/4        /* >= 1024px: quarter width */
  xl:w-1/5        /* >= 1280px: fifth width */
">
  Responsive width
</div>

<!-- Responsive grid -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <div>Item</div>
  <div>Item</div>
  <div>Item</div>
  <div>Item</div>
</div>

<!-- Hide/show at breakpoints -->
<div class="hidden md:block">Desktop only</div>
<div class="block md:hidden">Mobile only</div>
```

## Interactive States

```html
<!-- Hover and focus -->
<button class="
  bg-blue-500
  hover:bg-blue-600
  focus:outline-none
  focus:ring-2
  focus:ring-blue-500
  focus:ring-offset-2
">
  Interactive button
</button>

<!-- Active and disabled -->
<button class="
  bg-blue-500
  active:bg-blue-700
  disabled:opacity-50
  disabled:cursor-not-allowed
">
  Button
</button>

<!-- Group hover -->
<div class="group">
  <div class="group-hover:text-blue-500">
    Changes on parent hover
  </div>
</div>
```

## Component Examples

### Card Component

```html
<div class="rounded-lg border border-gray-200 dark:border-gray-700
            bg-white dark:bg-gray-800
            shadow-sm dark:shadow-none
            p-6">
  <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
    Card Title
  </h3>
  <p class="mt-2 text-gray-600 dark:text-gray-300">
    Card description text goes here.
  </p>
  <button class="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md
                 hover:bg-blue-600 transition-colors">
    Action
  </button>
</div>
```

### Badge Component

```html
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full
             text-xs font-medium
             bg-green-100 text-green-800
             dark:bg-green-900 dark:text-green-200">
  Active
</span>
```

### Input Component

```html
<input
  type="text"
  class="w-full px-3 py-2
         border border-gray-300 dark:border-gray-600
         rounded-md
         bg-white dark:bg-gray-800
         text-gray-900 dark:text-white
         placeholder-gray-400 dark:placeholder-gray-500
         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
  placeholder="Enter text..."
/>
```

## Class Merging with cn()

```typescript
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Usage in components
function Button({ className, variant, ...props }) {
  return (
    <button
      className={cn(
        "px-4 py-2 rounded-md font-medium transition-colors",
        variant === "primary" && "bg-blue-500 text-white hover:bg-blue-600",
        variant === "secondary" && "bg-gray-200 text-gray-900 hover:bg-gray-300",
        className
      )}
      {...props}
    />
  );
}
```

## v3 to v4 Migration

### Shadow Utility Names

```html
<!-- v3 → v4 -->
shadow-sm  → shadow-xs
shadow     → shadow-sm
```

### Import Changes

```css
/* v3 */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* v4 */
@import "tailwindcss";
```

## Best Practices

1. **Mobile-first responsive design** - Start with mobile styles, add breakpoints
2. **Use semantic color names** - primary, secondary, success, error
3. **Leverage CSS variables** - Easy theme customization
4. **Use cn() for class merging** - Prevents conflicting classes
5. **Dark mode from the start** - Add dark: variants as you build
6. **Group related utilities** - Keep related classes together

## Integration with Context7

To fetch latest Tailwind CSS documentation, use:
- Library ID: `/websites/tailwindcss`
- Topics: "dark mode", "responsive design", "utility classes", "v4"
