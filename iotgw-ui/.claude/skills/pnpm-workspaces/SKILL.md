---
name: pnpm-workspaces
description: This skill provides guidance for managing monorepos with pnpm workspaces. It should be used when setting up workspaces, managing cross-package dependencies, running filtered commands, linking local packages, or coordinating builds across packages.
---

# pnpm Workspaces

This skill provides patterns for managing monorepos using pnpm workspaces, enabling efficient multi-package development.

## Purpose

To enable managing multiple packages in a single repository with shared dependencies, cross-package references, and coordinated commands.

## When to Use

- Setting up a new monorepo structure
- Adding or managing workspace packages
- Running commands across specific packages
- Managing cross-package dependencies
- Coordinating build order
- Publishing packages from a monorepo

## Workspace Setup

### Directory Structure

```
project-root/
├── pnpm-workspace.yaml    # Workspace configuration
├── package.json           # Root package.json
├── apps/
│   ├── frontend/          # Frontend application
│   │   └── package.json
│   └── backend/           # Backend application
│       └── package.json
└── packages/
    ├── shared/            # Shared utilities
    │   └── package.json
    └── contract/          # Shared types/contracts
        └── package.json
```

### pnpm-workspace.yaml

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

### Root package.json

```json
{
  "name": "my-monorepo",
  "private": true,
  "scripts": {
    "dev": "mprocs",
    "build": "pnpm -r run build",
    "test": "pnpm -r run test",
    "lint": "pnpm -r run lint",
    "typecheck": "pnpm -r run typecheck"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

### Package package.json

```json
{
  "name": "@myorg/shared",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts",
    "dev": "tsup src/index.ts --watch"
  },
  "dependencies": {},
  "devDependencies": {
    "tsup": "^8.0.0"
  }
}
```

## Referencing Workspace Packages

### Using workspace: Protocol

```json
{
  "name": "@myorg/frontend",
  "dependencies": {
    "@myorg/shared": "workspace:*",
    "@myorg/contract": "workspace:^"
  }
}
```

| Protocol | Behavior |
|----------|----------|
| `workspace:*` | Any version in workspace |
| `workspace:^` | Compatible version (^x.y.z on publish) |
| `workspace:~` | Patch version (~x.y.z on publish) |
| `workspace:../path` | Relative path reference |

### Relative Path Reference

```json
{
  "dependencies": {
    "@myorg/shared": "workspace:../packages/shared"
  }
}
```

## Filtering Commands

### Package Name Filters

```bash
# Run in specific package
pnpm --filter @myorg/frontend dev

# Run in multiple packages
pnpm --filter "@myorg/frontend" --filter "@myorg/backend" build

# Run in packages matching pattern
pnpm --filter "@myorg/*" build

# Exclude packages
pnpm --filter "!@myorg/tests" build
```

### Dependency-Based Filters

```bash
# Run in package and all its dependencies
pnpm --filter @myorg/frontend... build

# Run in package and all its dependents
pnpm --filter ...@myorg/shared build

# Run in dependencies only (exclude the package itself)
pnpm --filter "@myorg/frontend^..." build
```

### Directory Filters

```bash
# Run in packages under apps/
pnpm --filter "./apps/**" build

# Run in specific directory
pnpm --filter "./packages/shared" build
```

### Changed Package Filters

```bash
# Run in packages changed since main branch
pnpm --filter "...[origin/main]" build

# Run in changed packages and their dependents
pnpm --filter "...[origin/main]..." build
```

## Managing Dependencies

### Installing Dependencies

```bash
# Install dependency to specific package
pnpm --filter @myorg/frontend add react

# Install dev dependency
pnpm --filter @myorg/frontend add -D vitest

# Install to root (shared dev dependencies)
pnpm add -D -w typescript

# Install to all packages
pnpm -r add lodash
```

### Removing Dependencies

```bash
# Remove from specific package
pnpm --filter @myorg/frontend remove lodash

# Remove from all packages
pnpm -r remove lodash
```

### Updating Dependencies

```bash
# Update in specific package
pnpm --filter @myorg/frontend update react

# Update across all packages
pnpm -r update

# Interactive update
pnpm -r update -i
```

## Running Scripts

### Recursive Execution

```bash
# Run script in all packages (parallel by default)
pnpm -r run build

# Run sequentially
pnpm -r --sequential run build

# Run with specific concurrency
pnpm -r --workspace-concurrency 3 run build

# Continue on error
pnpm -r --no-bail run test
```

### Script with Dependencies

```bash
# Build packages in dependency order
pnpm -r run build

# Ensure dependencies are built first
pnpm --filter @myorg/frontend... run build
```

## Build Coordination

### Example Build Configuration

```json
{
  "name": "my-monorepo",
  "scripts": {
    "build": "pnpm build:packages && pnpm build:apps",
    "build:packages": "pnpm --filter './packages/**' run build",
    "build:apps": "pnpm --filter './apps/**' run build",
    "dev": "pnpm -r --parallel run dev"
  }
}
```

### TypeScript Project References

```json
// packages/shared/tsconfig.json
{
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist"
  }
}
```

```json
// apps/frontend/tsconfig.json
{
  "compilerOptions": {},
  "references": [
    { "path": "../../packages/shared" },
    { "path": "../../packages/contract" }
  ]
}
```

## Common Patterns

### Development Workflow

```bash
# Start all dev servers
pnpm dev

# Start specific app with its dependencies in watch mode
pnpm --filter @myorg/frontend... dev

# Run tests in changed packages
pnpm --filter "...[origin/main]" test
```

### CI/CD Commands

```bash
# Install all dependencies
pnpm install --frozen-lockfile

# Build all packages in order
pnpm -r run build

# Run all tests
pnpm -r run test

# Type check all packages
pnpm -r run typecheck
```

### Adding a New Package

```bash
# Create package directory
mkdir -p packages/new-package

# Initialize package.json
cd packages/new-package
pnpm init

# Install from root
cd ../..
pnpm install
```

## Configuration Options

### .npmrc Settings

```ini
# .npmrc
# Link workspace packages
link-workspace-packages = true

# Hoist patterns (shared dependencies)
public-hoist-pattern[]=*eslint*
public-hoist-pattern[]=*prettier*

# Strict peer dependencies
strict-peer-dependencies = false

# Save exact versions
save-exact = true
```

### package.json Workspace Config

```json
{
  "pnpm": {
    "overrides": {
      "lodash": "^4.17.21"
    },
    "peerDependencyRules": {
      "ignoreMissing": ["@types/*"]
    }
  }
}
```

## Troubleshooting

### Common Issues

```bash
# Clear pnpm cache
pnpm store prune

# Rebuild node_modules
rm -rf node_modules
rm -rf **/node_modules
pnpm install

# Check why a package is installed
pnpm why lodash

# List workspace packages
pnpm ls -r --depth -1

# Check for outdated packages
pnpm -r outdated
```

### Dependency Issues

```bash
# Force reinstall
pnpm install --force

# Check for peer dependency issues
pnpm install --strict-peer-dependencies
```

## Best Practices

1. **Use workspace: protocol** - Ensures local packages are linked
2. **Keep shared deps in root** - TypeScript, ESLint, Prettier
3. **Use filters for targeted commands** - Faster execution
4. **Maintain consistent versions** - Use pnpm overrides
5. **Document workspace structure** - README with package descriptions
6. **Set up proper build order** - Use filters with `...` for dependencies

## Integration with Context7

To fetch latest pnpm documentation, use:
- Library ID: `/pnpm/pnpm.io`
- Topics: "workspaces", "filtering", "monorepo"
