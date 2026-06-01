---
name: eslint-prettier
description: This skill provides guidance for configuring and using ESLint and Prettier for code linting and formatting in TypeScript/React projects. Use when setting up linting rules, fixing lint errors, or configuring code formatting.
---

# ESLint and Prettier

Code quality tools for finding problems and enforcing consistent formatting in JavaScript/TypeScript projects.

## Context7 Library IDs

For up-to-date documentation:
- `/eslint/eslint` - ESLint core
- `/typescript-eslint/typescript-eslint` - TypeScript ESLint

## ESLint Configuration (Flat Config)

### eslint.config.js (ESLint 9+)

```javascript
import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      // TypeScript rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],

      // React rules
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // General rules
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
    },
    settings: {
      react: { version: "detect" },
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "*.config.js"],
  },
  prettier, // Must be last to override other formatting rules
];
```

### Legacy .eslintrc.cjs (ESLint 8)

```javascript
module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "prettier", // Must be last
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: ["./tsconfig.json"],
  },
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "error",
    "react/react-in-jsx-scope": "off",
  },
  settings: {
    react: { version: "detect" },
  },
};
```

## Prettier Configuration

### prettier.config.js

```javascript
/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: false,
  tabWidth: 2,
  trailingComma: "es5",
  printWidth: 80,
  bracketSpacing: true,
  arrowParens: "always",
  endOfLine: "lf",
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindConfig: "./tailwind.config.ts",
};
```

### .prettierignore

```
dist
node_modules
coverage
*.min.js
pnpm-lock.yaml
```

## Common ESLint Rules

### TypeScript Rules

```javascript
rules: {
  // Prevent unused variables (allow underscore prefix)
  "@typescript-eslint/no-unused-vars": [
    "error",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
  ],

  // Disallow any type
  "@typescript-eslint/no-explicit-any": "error",

  // Prefer type imports
  "@typescript-eslint/consistent-type-imports": [
    "error",
    { prefer: "type-imports", fixStyle: "inline-type-imports" }
  ],

  // Require return types on functions
  "@typescript-eslint/explicit-function-return-type": [
    "warn",
    { allowExpressions: true }
  ],

  // Enforce naming conventions
  "@typescript-eslint/naming-convention": [
    "error",
    { selector: "interface", format: ["PascalCase"] },
    { selector: "typeAlias", format: ["PascalCase"] },
    { selector: "enum", format: ["PascalCase"] },
  ],

  // Require await in async functions
  "@typescript-eslint/require-await": "error",

  // Prevent floating promises
  "@typescript-eslint/no-floating-promises": "error",

  // Prefer nullish coalescing
  "@typescript-eslint/prefer-nullish-coalescing": "error",

  // Prefer optional chaining
  "@typescript-eslint/prefer-optional-chain": "error",
}
```

### React Rules

```javascript
rules: {
  // Hooks rules
  "react-hooks/rules-of-hooks": "error",
  "react-hooks/exhaustive-deps": "warn",

  // JSX rules
  "react/jsx-no-target-blank": "error",
  "react/jsx-key": ["error", { checkFragmentShorthand: true }],
  "react/jsx-no-useless-fragment": "warn",
  "react/self-closing-comp": "warn",

  // Component rules
  "react/no-array-index-key": "warn",
  "react/no-unstable-nested-components": "error",

  // Props rules (for TypeScript, often disabled)
  "react/prop-types": "off",
  "react/require-default-props": "off",
}
```

## Package.json Scripts

```json
{
  "scripts": {
    "lint": "eslint . --ext .ts,.tsx",
    "lint:fix": "eslint . --ext .ts,.tsx --fix",
    "format": "prettier --write \"**/*.{ts,tsx,js,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,json,md}\"",
    "typecheck": "tsc --noEmit"
  }
}
```

## IDE Integration

### VS Code Settings (.vscode/settings.json)

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "never"
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ]
}
```

## Fixing Common Lint Errors

### Unused Variables

```typescript
// Error: 'data' is assigned but never used
const { data, error } = await fetchData();

// Fix 1: Use the variable
console.log(data);

// Fix 2: Prefix with underscore
const { data: _data, error } = await fetchData();

// Fix 3: Destructure only what you need
const { error } = await fetchData();
```

### Missing Dependencies in useEffect

```typescript
// Warning: React Hook useEffect has missing dependency: 'userId'
useEffect(() => {
  fetchUser(userId);
}, []);

// Fix 1: Add dependency
useEffect(() => {
  fetchUser(userId);
}, [userId]);

// Fix 2: If intentional, disable with comment
useEffect(() => {
  fetchUser(userId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

### Type Imports

```typescript
// Error: Use type imports
import { User, fetchUser } from "./api";

// Fix: Separate type and value imports
import type { User } from "./api";
import { fetchUser } from "./api";

// Or use inline type imports
import { type User, fetchUser } from "./api";
```

### No Explicit Any

```typescript
// Error: Unexpected any
function process(data: any) { ... }

// Fix: Use proper types
function process(data: unknown) { ... }
function process(data: Record<string, unknown>) { ... }
function process<T>(data: T) { ... }
```

## Disabling Rules

```typescript
// Disable for entire file (top of file)
/* eslint-disable @typescript-eslint/no-explicit-any */

// Disable for next line
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = {};

// Disable for specific line
const data: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

// Disable multiple rules
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars

// Re-enable rule
/* eslint-enable @typescript-eslint/no-explicit-any */
```

## Pre-commit Hooks with lint-staged

### package.json

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

### .husky/pre-commit

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
```

## Monorepo Configuration

For pnpm workspaces, use workspace root config:

```javascript
// Root eslint.config.js
export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
  },
  // ... shared rules
];

// Package-specific overrides in apps/app/eslint.config.js
import rootConfig from "../../eslint.config.js";

export default [
  ...rootConfig,
  {
    // Package-specific rules
  },
];
```

## Best Practices

1. **Run lint before commit** - Use husky + lint-staged
2. **Fix, don't disable** - Only disable rules with good reason
3. **Keep Prettier last** - In extends array to override formatting conflicts
4. **Use type-aware rules** - Enable parserOptions.project for better checks
5. **Consistent across team** - Check in config files, use editor settings
6. **Gradual adoption** - Start with warnings, upgrade to errors
