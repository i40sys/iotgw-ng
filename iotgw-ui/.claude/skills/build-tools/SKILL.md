---
name: build-tools
description: This skill provides guidance for using Vite, esbuild, and tsdown for building frontend and backend applications. Use when configuring builds, optimizing bundle size, or troubleshooting build issues.
---

# Build Tools (Vite, esbuild, tsdown)

Modern build tools for fast development and optimized production builds.

## Context7 Library IDs

For up-to-date documentation:
- `/vitejs/vite` - Vite
- `/websites/vite_dev` - Vite website

## Vite (Frontend)

### vite.config.ts

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "path";

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          router: ["@tanstack/react-router"],
          ui: ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu"],
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
});
```

### Environment Variables

```typescript
// .env files
// .env                # Loaded in all cases
// .env.local          # Loaded in all cases, ignored by git
// .env.development    # Only loaded in development
// .env.production     # Only loaded in production

// Access in code (must be prefixed with VITE_)
const apiUrl = import.meta.env.VITE_API_URL;
const isDev = import.meta.env.DEV;
const isProd = import.meta.env.PROD;
const mode = import.meta.env.MODE;

// TypeScript types (src/vite-env.d.ts)
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_TITLE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

### Code Splitting

```typescript
// Lazy loading routes
const Dashboard = lazy(() => import("./pages/Dashboard"));

// Dynamic imports
const loadModule = async () => {
  const module = await import("./heavy-module");
  return module.default;
};

// Manual chunks in config
rollupOptions: {
  output: {
    manualChunks(id) {
      if (id.includes("node_modules")) {
        if (id.includes("react")) return "vendor";
        if (id.includes("@tanstack")) return "tanstack";
        if (id.includes("@radix-ui")) return "ui";
      }
    },
  },
},
```

### Dev Server Configuration

```typescript
server: {
  port: 5173,
  host: true, // Listen on all addresses
  open: true, // Open browser on start
  cors: true,

  // Proxy API requests
  proxy: {
    "/api": {
      target: "http://localhost:3000",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ""),
    },
    "/ws": {
      target: "ws://localhost:3000",
      ws: true,
    },
  },

  // HMR configuration
  hmr: {
    overlay: true,
  },
},
```

### Build Optimization

```typescript
build: {
  target: "esnext",
  minify: "esbuild", // or "terser" for more control
  cssMinify: true,
  sourcemap: true, // or "hidden" for production

  // Chunk size warnings
  chunkSizeWarningLimit: 500,

  // Asset handling
  assetsInlineLimit: 4096, // Inline assets < 4kb

  rollupOptions: {
    output: {
      // Consistent chunk names
      chunkFileNames: "assets/[name]-[hash].js",
      entryFileNames: "assets/[name]-[hash].js",
      assetFileNames: "assets/[name]-[hash].[ext]",
    },
  },
},
```

## esbuild (Backend)

### Basic Configuration

```typescript
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: "dist/index.js",
  format: "esm",
  sourcemap: true,

  // External dependencies (not bundled)
  external: [
    // Node built-ins
    "path", "fs", "crypto",
    // Dependencies that should stay external
    "fastify", "@supabase/supabase-js",
  ],

  // Define compile-time constants
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});
```

### Watch Mode for Development

```typescript
import { context } from "esbuild";

const ctx = await context({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: "dist/index.js",
  format: "esm",
  sourcemap: true,
  external: ["fastify", "@trpc/server"],
});

// Start watching
await ctx.watch();
console.log("Watching for changes...");

// Cleanup on exit
process.on("SIGINT", async () => {
  await ctx.dispose();
  process.exit(0);
});
```

### Build Script (build.ts)

```typescript
import { build } from "esbuild";

async function main() {
  const isDev = process.env.NODE_ENV !== "production";

  await build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    platform: "node",
    target: "node20",
    outfile: "dist/index.js",
    format: "esm",
    sourcemap: isDev,
    minify: !isDev,

    // Mark workspace packages as external
    external: [
      "@iotgw/supabase-contract",
    ],

    // Plugins
    plugins: [],

    // Logging
    logLevel: "info",
  });

  console.log("Build complete!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

## tsdown (Package Building)

### tsdown.config.ts

```typescript
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true, // Generate .d.ts files
  sourcemap: true,
  clean: true,

  // Output configuration
  outDir: "dist",

  // External dependencies
  external: ["zod"],

  // Target environment
  target: "node18",
});
```

### Package.json for Dual ESM/CJS

```json
{
  "name": "@iotgw/supabase-contract",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "dev": "tsdown --watch"
  }
}
```

## Common Build Issues

### Module Resolution

```typescript
// Error: Cannot find module './component'
// Fix: Ensure file extension or index file exists

// In Vite config
resolve: {
  extensions: [".ts", ".tsx", ".js", ".jsx"],
},

// For Node.js ESM
// Use explicit extensions in imports
import { helper } from "./utils.js"; // Note: .js even for .ts files
```

### Path Aliases

```typescript
// vite.config.ts
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
    "@components": path.resolve(__dirname, "./src/components"),
  },
},

// tsconfig.json (must match!)
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"]
    }
  }
}
```

### External Dependencies

```typescript
// esbuild - Mark as external to not bundle
external: ["fastify", "pino"],

// Vite - For SSR or node targets
ssr: {
  external: ["fastify"],
  noExternal: ["@iotgw/supabase-contract"], // Force bundling
},
```

### CommonJS Compatibility

```typescript
// Vite config for CJS dependencies
optimizeDeps: {
  include: ["some-cjs-package"],
},

// esbuild for mixed ESM/CJS
format: "esm",
banner: {
  js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
},
```

## Development Workflow

### Package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  }
}
```

### Monorepo Build Order

```json
{
  "scripts": {
    "build": "pnpm -r --filter=@iotgw/supabase-contract build && pnpm -r --filter=!@iotgw/supabase-contract build",
    "dev": "pnpm -r --parallel dev"
  }
}
```

## Performance Tips

1. **Use esbuild for TypeScript** - Vite uses esbuild by default for transpilation
2. **Minimize external dependencies** - Each external requires a separate request in dev
3. **Configure optimizeDeps** - Pre-bundle heavy dependencies
4. **Use dynamic imports** - Split code for faster initial load
5. **Enable caching** - Vite caches pre-bundled dependencies
6. **Tree shaking** - Use ESM imports for better dead code elimination

## Build Analysis

```bash
# Vite bundle analysis
npx vite-bundle-visualizer

# Or use rollup-plugin-visualizer
import { visualizer } from "rollup-plugin-visualizer";

plugins: [
  visualizer({
    open: true,
    gzipSize: true,
  }),
],
```
