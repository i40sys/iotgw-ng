# Build stage
FROM node:24-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.6.3 --activate

# Set working directory
WORKDIR /app

# Copy root package.json and workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy workspace package.json files (needed for pnpm workspaces resolution)
COPY apps/backend/package.json ./apps/backend/
COPY packages/supabase-contract/package.json ./packages/supabase-contract/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy backend source code and the supabase-contract package source (needed at build)
COPY apps/backend ./apps/backend/
COPY packages/supabase-contract ./packages/supabase-contract/
COPY tsconfig.json ./

# Build the application
RUN pnpm --filter @iotgw/backend build

# Production stage
FROM node:24-alpine AS production

# Set working directory
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.6.3 --activate

# Copy package.json files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/supabase-contract/package.json ./packages/supabase-contract/

# Install only production dependencies
RUN pnpm install --frozen-lockfile

# Copy built assets from builder stage
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist

# Expose the port the app runs on
EXPOSE 4444

# Run the application
CMD ["node", "apps/backend/dist/server.js"]