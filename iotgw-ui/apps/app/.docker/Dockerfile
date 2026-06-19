FROM node:24-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.6.3 --activate

# Set working directory
WORKDIR /app

# Copy root package.json and workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy workspace package.json files (needed for pnpm workspaces resolution)
COPY apps/app/package.json ./apps/app/
COPY packages/supabase-contract/package.json ./packages/supabase-contract/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy app source code and the supabase-contract package source (needed at build)
COPY apps/app ./apps/app/
COPY packages/supabase-contract ./packages/supabase-contract/
COPY tsconfig.json ./

# VITE_API_URL is baked into the JS bundle at build time (import.meta.env).
# Pass --build-arg VITE_API_URL=<url> to docker build so the SPA knows where
# the backend tRPC endpoint is reachable from the user's browser.
ARG VITE_API_URL=http://localhost:4444/
ENV VITE_API_URL=$VITE_API_URL

# Build the application
RUN pnpm --filter @iotgw/app build

# Production image
FROM nginx:alpine AS production

# Copy built assets from builder stage
COPY --from=base /app/apps/app/dist /usr/share/nginx/html

# Add nginx config
COPY apps/app/.docker/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]