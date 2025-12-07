# apps/backend/Dockerfile
# urvives timeouts, caches store forever, offline after first build
# Requires BuildKit (export DOCKER_BUILDKIT=1; already on in your compose)

FROM node:20-alpine AS base

# Install fixed pnpm (no Corepack/network calls)
RUN npm i -g pnpm@10.24.0

WORKDIR /app

# Dirs + permissions (for store/logs)
RUN mkdir -p /logs /app/.pnpm-store && \
    chown -R node:node /app /logs /app/.pnpm-store

USER node

# pnpm configs: High timeouts/retries, low concurrency (fixes ETIMEDOUT)
RUN pnpm config set store-dir /app/.pnpm-store
RUN pnpm config set fetch-timeout 300000   # 5min
RUN pnpm config set fetch-retries 10       # More retries
RUN pnpm config set fetch-retry-factor 10
RUN pnpm config set fetch-retry-mintimeout 10000
RUN pnpm config set fetch-retry-maxtimeout 120000
RUN pnpm config set network-concurrency 4  # Less parallel = fewer timeouts
RUN pnpm config set strict-ssl true        # But if needed, set false for HTTP

# ─────────────────────────────────────
# Fetcher: Download deps to store (network-heavy, cached forever)
FROM base AS fetcher

# Copy minimal for fetch (lockfiles + configs)
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node packages ./packages
COPY --chown=node:node apps/backend/package.json ./apps/backend/ 

# First build: Downloads with retries; subsequent: Skips if unchanged
RUN --mount=type=cache,target=/app/.pnpm-store,uid=1000,gid=1000 \
    pnpm fetch --frozen-lockfile

# ─────────────────────────────────────
# Installer: Install from store (100% offline, fast)
FROM base AS installer

# Copy fetcher files
COPY --chown=node:node --from=fetcher /app ./

# Install offline (uses same cache mount)
RUN --mount=type=cache,target=/app/.pnpm-store,uid=1000,gid=1000 \
    CI=true pnpm install -r --offline --frozen-lockfile --shamefully-hoist 

# ─────────────────────────────────────
# Builder: Compile code
FROM base AS builder

# Copy installed deps + source
COPY --chown=node:node --from=installer /app/node_modules ./node_modules
COPY --chown=node:node --from=installer /app/packages ./packages
COPY --chown=node:node . .
RUN pnpm --filter @regloom/backend build 

# ─────────────────────────────────────
# Dev: Hot reload + mounted store/logs
FROM node:20-slim AS dev

RUN apt-get update && \
    apt-get install -y --no-install-recommends wget ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=development

RUN npm i -g pnpm@10.24.0

WORKDIR /app

RUN mkdir -p /logs /app/.pnpm-store /app/apps/uploads && \
    chown -R node:node /app /logs /app/.pnpm-store /app/apps/uploads

USER node

# Set store for runtime (matches volume)
RUN pnpm config set store-dir /app/.pnpm-store

# Copy pre-installed deps
COPY --from=installer --chown=node:node /app/node_modules ./node_modules
COPY --from=installer --chown=node:node /app/packages ./packages
COPY --from=installer --chown=node:node /app/pnpm-lock.yaml ./
COPY --from=installer --chown=node:node /app/pnpm-workspace.yaml ./
COPY --from=installer --chown=node:node /app/tsconfig.json ./

EXPOSE 4000

CMD ["pnpm", "--filter", "@regloom/backend", "run", "dev"]