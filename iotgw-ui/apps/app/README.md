# IoT Gateway Frontend

The frontend application for IoT Gateway built with React, TanStack Router, and TailwindCSS.

## Features

- **Dark/Light Theme Support**: Full theming with system preference detection
- **Internationalization**: Multi-language support with i18next
- **Type-safe API Communication**: Using tRPC client for end-to-end type safety
- **Responsive Design**: Mobile-friendly UI with TailwindCSS

## Directory Structure

- `src/components/`: UI components and shared building blocks
- `src/context/`: React context providers
- `src/hooks/`: Custom React hooks
- `src/i18n/`: Internationalization configuration and translations
- `src/lib/`: Utility functions and libraries
- `src/pages/`: Page components (high-level views)
- `src/routes/`: TanStack Router route definitions
- `src/utils/`: Helper functions and utilities

## Key Components

### Navigation

The application uses TanStack Router for navigation with a centralized router configuration:

- `NavigationBar`: Main navigation component for the application
- `__root.tsx`: Root route definition that sets up the app layout

### Theming

The application includes a complete theme system with dark and light mode:

- `ThemeProvider`: Context provider for managing theme state
- `useTheme`: Hook for accessing and updating theme
- `ModeToggle`: UI component for switching between themes

### Internationalization

Localization is managed with i18next:

- `i18n/index.ts`: Configuration for i18next
- `i18n/locales/`: Translation files for different languages
- `LanguageSwitcher`: Component for changing the current language

## Development

To start the development server:

```bash
# From the app directory
pnpm dev

# From the root directory
pnpm app
```

## Building

To build the application:

```bash
pnpm build
```

The build output will be in the `dist` directory.

## Connection to Backend

The frontend communicates with the backend through tRPC. The configuration is in `src/utils/trpc.ts` which sets up the tRPC client with React Query integration.
