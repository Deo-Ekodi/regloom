# BUILDER STAGE
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app

# Copy workspace + lockfiles
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json ./apps/frontend/package.json

# Install all deps
RUN pnpm install --recursive --frozen-lockfile --production=false

# Copy source + build
COPY . .
RUN pnpm --filter @regloom/frontend build

# DEV STAGE — HOT RELOAD + LOGGING
FROM node:20-alpine AS dev
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app

# Critical: Create /logs and give node user write access
RUN mkdir -p /logs && chown -R node:node /logs
VOLUME /logs

# Run as non-root (safe + matches other services)
USER node

# Copy dependencies and source
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/pnpm-workspace.yaml .
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/frontend ./apps/frontend
COPY --from=builder /app/package.json ./

# Vite dev server
CMD ["pnpm", "--filter", "@regloom/frontend", "dev"]