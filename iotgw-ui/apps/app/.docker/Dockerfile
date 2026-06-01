FROM node:24-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.6.3 --activate

# Set working directory
WORKDIR /app

# Copy root package.json and workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy the app package.json
COPY apps/app/package.json ./apps/app/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy app source code
COPY apps/app ./apps/app/
COPY tsconfig.json ./

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