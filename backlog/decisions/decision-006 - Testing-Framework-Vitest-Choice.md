---
id: decision-006
title: Testing Framework - Vitest Choice
date: "2025-09-24 06:30"
status: approved
---

## Context

The IoT Gateway UI application requires a robust testing framework to ensure code quality, prevent regressions, and maintain confidence in the codebase. The testing solution needs to integrate well with our existing technology stack:

- Vite as the build tool
- React 19 for the UI
- TypeScript for type safety
- tRPC for API communication
- Supabase for the backend
- pnpm workspaces for monorepo management

Key requirements for our testing framework:

- Support unit testing for utilities and functions
- Enable component testing for React components
- Handle async operations and API mocking
- Provide fast feedback during development
- Integrate with our TypeScript and ESM setup
- Support code coverage reporting
- Work well in our monorepo structure
- Minimize configuration complexity

## Decision

**Testing Framework**: Vitest with React Testing Library

- Chosen over Jest for native Vite integration and superior performance
- Vitest reuses Vite's configuration, plugins, and transformation pipeline
- React Testing Library for component testing with best practices

**Key Advantages**:

1. **Native Vite Integration** - No duplicate configuration between build and test
2. **Performance** - Leverages esbuild, parallel execution, instant HMR-like re-runs
3. **ESM First** - Built for modern JavaScript modules without complex transformations
4. **Developer Experience** - Built-in UI mode, VS Code integration, Jest-compatible API
5. **Modern Defaults** - Minimal configuration with sensible defaults for monorepos

**Implementation**:

```typescript
// vitest.config.ts shares Vite config
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
```

## Consequences

**Positive:**

- Unified configuration reduces maintenance burden
- Tests run significantly faster, especially in watch mode
- Better TypeScript experience without ts-jest transformations
- Aligns with modern, ESM-first tooling choices
- API similarity with Jest enables immediate productivity

**Negative:**

- Smaller ecosystem compared to Jest's maturity
- Fewer community resources and examples available
- Potential for breaking changes as a younger project
- Team may need training on Vitest-specific features

**Risks:**

- Limited third-party plugin availability
- Less battle-tested in large production environments
- Migration effort if switching back to Jest becomes necessary
