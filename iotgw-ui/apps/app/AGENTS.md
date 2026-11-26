# Frontend App (apps/app)

React 19 SPA for IoT gateway management.

## Stack

React 19, Vite 6, TanStack Router (file-based) + Query, tRPC v11 client, Tailwind CSS v4, Shadcn/UI (Radix + cva), react-i18next, React Hook Form + Zod, Monaco Editor, Sonner (toasts), supabase-js (operator login). Tests: Vitest + Testing Library (jsdom), Playwright (`e2e/`).

## Structure

```
src/
├── routes/              # File-based routes (auto-generates routeTree.gen.ts); login.tsx
├── components/
│   ├── ui/              # Shadcn/UI base components
│   ├── devices/         # Device management
│   ├── networks/        # Network management
│   ├── domains/         # Domain management
│   ├── deployments/     # Deployment workspace (device picker, config panel, review)
│   ├── deployment-steps/ # Per-step deployment views (config editor, schema form, boot/reboot)
│   ├── navigation/      # Navigation config
│   └── *.tsx            # Shared feature components (jobs lists, dialogs, navigation bar)
├── hooks/               # Custom hooks (validation, storage, navigation guards, device code)
├── context/             # React Context (theme, sidebar)
├── i18n/locales/        # en.json (maintained); es.json (not maintained)
├── schemas/             # Zod deployment-config schema (used by lib/deployment-workspace.ts)
├── utils/               # trpc client, helpers
├── lib/                 # cn() (utils.ts), auth.ts (Supabase session), deployment/workflow helpers
└── test/                # Vitest setup
```

The deployment wizard renders and validates against the ONE deployment-config JSON Schema from `packages/supabase-contract` (`lib/deployment-config-form.ts`, task-130).

## Key Patterns

- **Routes** use `createFileRoute`; data routes use a `loader` for prefetching via `trpc.*.queryOptions()`
- **tRPC client** at `src/utils/trpc.ts` — uses `createTRPCOptionsProxy`; `splitLink` sends subscriptions over `wsLink` (token in `connectionParams`) and the rest over `httpBatchLink`
- **Auth** (decision-034): the root route redirects to `/login` without a session; UNAUTHORIZED/FORBIDDEN errors sign out and redirect
- **Root route** provides `trpc` + `queryClient` via context to all child routes
- **Components** use `data-slot` (new primitives), `asChild` via Radix Slot, `cn()` for class merging
- **Theme** via `ThemeProvider` context with dark/light mode, stored in localStorage
- **i18n**: Always use `useTranslation()` hook; add keys to `en.json` only (English-only UI; browser-language detection disabled)
- **Forms**: React Hook Form + Zod resolver pattern

## Commands

```bash
pnpm dev          # Vite on 0.0.0.0:52173 (strictPort)
pnpm test:run     # Vitest
pnpm test:e2e     # Playwright
```

## Adding a New Route

1. Create file in `src/routes/` following TanStack Router naming (`$param` for dynamic, `index.tsx` for index)
2. Route tree regenerates automatically via Vite plugin
3. Add translations to `en.json`
4. Use `trpc.*.queryOptions()` in route loader for data prefetching

## Adding a New Component

1. Place in `src/components/` (UI primitives in `ui/`, feature components in feature dirs)
2. Named export, kebab-case filename (`device-totp-dialog.tsx`)
3. Define props interface extending `React.ComponentProps<>` when wrapping HTML elements
4. Use Tailwind classes exclusively — no inline styles

## References

- [decision-001](../../../backlog/decisions/decision-001%20-%20Frontend-Technology-Stack-React-19-and-TanStack-Ecosystem.md) — stack rationale
- [doc-006](../../../backlog/docs/doc-006%20-%20React-Component-Development-Guidelines.md) — component guidelines
- [doc-013](../../../backlog/docs/doc-013%20-%20Deployments-Page-Behavior-Specification.md) — Deployments page spec
- [doc-011](../../../backlog/docs/doc-011%20-%20Deployment-Section-Redesign-Interface-Specification.md) — Deployment section redesign spec
