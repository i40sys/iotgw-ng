---
title: Testing with Vitest
category: skills
tags: [app/iotgw-ui, app/frontend, app/backend, status/current]
sources:
  - backlog/decisions/decision-006 - Testing-Framework-Vitest-Choice.md
  - backlog/docs/doc-009 - Testing-with-Vitest.md
  - backlog/docs/doc-002 - Testing-Strategies-and-Patterns.md
relationships:
  - target: "[[concepts/iotgw-ui-architecture]]"
    type: related_to
summary: How the iotgw-ui project tests — Vitest + React Testing Library (chosen over Jest for native Vite integration), with patterns for components, tRPC procedures, and Supabase/external mocking.
provenance:
  extracted: 0.82
  inferred: 0.12
  ambiguous: 0.06
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Testing with Vitest

The project tests with **Vitest + React Testing Library**, chosen over Jest for
**native Vite integration** (Vitest reuses Vite's config/plugins/transform
pipeline — no duplicate config) and performance (esbuild, parallel, instant
re-runs) (decision-006).

## Setup

`vitest.config.ts` shares the Vite config; `environment: "jsdom"`, `globals:
true`, `setupFiles: "./src/test/setup.ts"` (jest-dom matchers + RTL cleanup).

## What to test (doc-002, doc-009)

- **React components** — render + assert via RTL; `userEvent` for interaction.
- **Custom hooks** — `renderHook` wrapped in a `QueryClientProvider` test wrapper.
- **tRPC procedures** — build a context via `createContext`, call the
  `appRouter` procedure, assert `TRPCError` codes on failure paths.
- **Database integration / TanStack Query** — exercise the data-fetching seam.
- **Mocking** — mock external dependencies (Supabase client, etc.) at the module
  boundary.

## Trade-offs

Smaller ecosystem than Jest, but the Jest-compatible API means immediate
productivity, and ESM-first removes the `ts-jest` transformation friction.

## Sources

- decision-006 (Vitest choice), doc-009 (testing guide), doc-002 (testing
  strategies & patterns).
- Related: [[concepts/iotgw-ui-architecture]], [[skills/iotgw-ui-development-workflow]].
