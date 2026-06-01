# Frontend App (apps/app)

React 19 SPA for IoT gateway management.

## Stack

React 19, Vite 6, TanStack Router (file-based) + Query, tRPC v11 client, Tailwind CSS v4, Shadcn/UI (Radix + cva), react-i18next, React Hook Form + Zod, Monaco Editor, Sonner (toasts).

## Structure

```
src/
├── routes/          # File-based routes (auto-generates routeTree.gen.ts)
├── components/
│   ├── ui/          # Shadcn/UI base components
│   ├── devices/     # Device management
│   ├── networks/    # Network management
│   ├── domains/     # Domain management
│   └── deployment-* # Deployment components
├── hooks/           # Custom hooks (validation, storage, navigation guards)
├── context/         # React Context (theme, sidebar)
├── i18n/locales/    # en.json, es.json
├── schemas/         # Zod schemas (deployment config)
├── utils/           # trpc client, helpers
└── lib/             # cn() utility
```

## Key Patterns

- **Routes** use `createFileRoute` with `loader` for data prefetching via `trpc.*.queryOptions()`
- **tRPC client** at `src/utils/trpc.ts` — uses `createTRPCOptionsProxy` with `httpBatchLink`
- **Root route** provides `trpc` + `queryClient` via context to all child routes
- **Components** use `data-slot`, `asChild` via Radix Slot, `cn()` for class merging
- **Theme** via `ThemeProvider` context with dark/light mode, stored in localStorage
- **i18n**: Always use `useTranslation()` hook; add keys to both `en.json` and `es.json`
- **Forms**: React Hook Form + Zod resolver pattern

## Adding a New Route

1. Create file in `src/routes/` following TanStack Router naming (`$param` for dynamic, `index.tsx` for index)
2. Route tree regenerates automatically via Vite plugin
3. Add translations to both locale files
4. Use `trpc.*.queryOptions()` in route loader for data prefetching

## Adding a New Component

1. Place in `src/components/` (UI primitives in `ui/`, feature components in feature dirs)
2. Named export, PascalCase filename
3. Define props interface extending `React.ComponentProps<>` when wrapping HTML elements
4. Use Tailwind classes exclusively — no inline styles

## References

- [decision-001](../../backlog/decisions/decision-001%20-%20Frontend-Technology-Stack-React-19-and-TanStack-Ecosystem.md) — stack rationale
- [doc-006](../../backlog/docs/doc-006%20-%20React-Component-Development-Guidelines.md) — component guidelines
- [doc-013](../../backlog/docs/doc-013%20-%20Deployments-Page-Behavior-Specification.md) — Deployments page spec
- [doc-011](../../backlog/docs/doc-011%20-%20Deployment-Section-Redesign-Interface-Specification.md) — Deployment section redesign spec
