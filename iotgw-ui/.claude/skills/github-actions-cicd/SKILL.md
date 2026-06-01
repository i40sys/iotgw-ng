---
name: github-actions-cicd
description: This skill provides guidance for setting up CI/CD pipelines with GitHub Actions for testing, building, and deploying applications. Use when creating or modifying workflow files or automating development processes.
---

# CI/CD with GitHub Actions

Automate testing, building, and deployment workflows directly in your GitHub repository.

## Context7 Library IDs

For up-to-date documentation:
- `/websites/github_en_actions` - GitHub Actions docs

## Workflow Basics

### Workflow File Structure

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npm test
```

### Triggers

```yaml
on:
  # Push to specific branches
  push:
    branches: [main, develop]
    paths:
      - "src/**"
      - "package.json"
    paths-ignore:
      - "**.md"

  # Pull requests
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

  # Manual trigger
  workflow_dispatch:
    inputs:
      environment:
        description: "Deployment environment"
        required: true
        default: "staging"
        type: choice
        options:
          - staging
          - production

  # Scheduled
  schedule:
    - cron: "0 0 * * *" # Daily at midnight

  # On release
  release:
    types: [published]
```

## Complete CI Workflow

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: "20"

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run ESLint
        run: pnpm lint

      - name: Check formatting
        run: pnpm format:check

  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type check
        run: pnpm typecheck

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm test --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build
          path: dist/
          retention-days: 7
```

## Deployment Workflow

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: "Environment"
        required: true
        type: choice
        options:
          - staging
          - production

jobs:
  deploy:
    name: Deploy to ${{ github.event.inputs.environment || 'staging' }}
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment || 'staging' }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build
        env:
          VITE_API_URL: ${{ vars.API_URL }}

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: ${{ github.event.inputs.environment == 'production' && '--prod' || '' }}
```

## Matrix Builds

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node-version: [18, 20, 22]
        exclude:
          - os: windows-latest
            node-version: 18
      fail-fast: false # Continue other jobs if one fails

    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npm test
```

## Caching

```yaml
# pnpm cache (recommended way)
- name: Setup pnpm
  uses: pnpm/action-setup@v3
  with:
    version: 9

- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: "20"
    cache: "pnpm" # Built-in caching

# Manual cache
- name: Cache node_modules
  uses: actions/cache@v4
  with:
    path: node_modules
    key: ${{ runner.os }}-node-${{ hashFiles('pnpm-lock.yaml') }}
    restore-keys: |
      ${{ runner.os }}-node-

# Turbo repo cache
- name: Cache turbo build
  uses: actions/cache@v4
  with:
    path: .turbo
    key: ${{ runner.os }}-turbo-${{ github.sha }}
    restore-keys: |
      ${{ runner.os }}-turbo-
```

## Secrets and Variables

```yaml
# Using secrets
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}

# Using variables (non-sensitive)
env:
  API_URL: ${{ vars.API_URL }}

# Environment-specific secrets
jobs:
  deploy:
    environment: production
    steps:
      - run: echo ${{ secrets.PRODUCTION_API_KEY }}
```

## Conditional Execution

```yaml
steps:
  # Run only on main branch
  - name: Deploy
    if: github.ref == 'refs/heads/main'
    run: ./deploy.sh

  # Run only on PR
  - name: PR Check
    if: github.event_name == 'pull_request'
    run: ./pr-check.sh

  # Run on failure
  - name: Notify on failure
    if: failure()
    run: ./notify-failure.sh

  # Run always (even if previous steps failed)
  - name: Cleanup
    if: always()
    run: ./cleanup.sh

  # Complex conditions
  - name: Release
    if: |
      github.event_name == 'push' &&
      github.ref == 'refs/heads/main' &&
      contains(github.event.head_commit.message, '[release]')
    run: ./release.sh
```

## Reusable Workflows

```yaml
# .github/workflows/reusable-test.yml
name: Reusable Test Workflow

on:
  workflow_call:
    inputs:
      node-version:
        required: false
        type: string
        default: "20"
    secrets:
      npm-token:
        required: false

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm ci
      - run: npm test
```

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    uses: ./.github/workflows/reusable-test.yml
    with:
      node-version: "20"
    secrets:
      npm-token: ${{ secrets.NPM_TOKEN }}
```

## PR Comments

```yaml
- name: Comment on PR
  if: github.event_name == 'pull_request'
  uses: actions/github-script@v7
  with:
    script: |
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: '✅ Build successful! Preview: https://preview.example.com'
      })
```

## Common Actions

```yaml
# Checkout
- uses: actions/checkout@v4
  with:
    fetch-depth: 0 # Full history for changelog

# Setup Node.js
- uses: actions/setup-node@v4
  with:
    node-version: "20"
    cache: "pnpm"
    registry-url: "https://npm.pkg.github.com"

# Upload/Download artifacts
- uses: actions/upload-artifact@v4
  with:
    name: build
    path: dist/

- uses: actions/download-artifact@v4
  with:
    name: build

# GitHub Release
- uses: softprops/action-gh-release@v2
  with:
    files: dist/*
    generate_release_notes: true
```

## Monorepo Support

```yaml
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      frontend: ${{ steps.filter.outputs.frontend }}
      backend: ${{ steps.filter.outputs.backend }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            frontend:
              - 'apps/app/**'
            backend:
              - 'apps/backend/**'

  frontend:
    needs: changes
    if: needs.changes.outputs.frontend == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm --filter app test

  backend:
    needs: changes
    if: needs.changes.outputs.backend == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm --filter backend test
```

## Best Practices

1. **Use specific action versions** - `@v4` not `@latest`
2. **Cache dependencies** - Faster builds
3. **Fail fast** - Lint before tests
4. **Use environments** - For deployment approval
5. **Keep secrets secure** - Never log secrets
6. **Use matrix for cross-platform** - Test multiple OS/Node versions
7. **Reuse workflows** - DRY principle
8. **Add status badges** - Show build status in README
