# apps/frontend/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# Production-grade, cache-obsessed, fully offline-capable frontend Dockerfile
# Matches the quality & resilience of apps/backend/Dockerfile
# Uses BuildKit cache mounts + separate fetch → install → build stages
# ─────────────────────────────────────────────────────────────────────────────

# ─── 1. Base (shared by all stages) ───────────────────────────────────────
FROM node:20-alpine AS base

# Pin exact pnpm version (same as root packageManager)
RUN npm i -g pnpm@10.24.0

WORKDIR /app

# Create persistent dirs + correct ownership early
RUN mkdir -p /logs /app/.pnpm-store /app/apps/uploads && \
    chown -R node:node /app /logs /app/.pnpm-store

USER node

# pnpm config – ultra resilient + shared store
RUN pnpm config set store-dir /app/.pnpm-store && \
    pnpm config set fetch-retries 10 && \
    pnpm config set fetch-retry-maxtimeout 120000 && \
    pnpm config set network-concurrency 4

# ─── 2. Fetcher – download deps only (cached forever) ─────────────────────
FROM base AS fetcher

# Copy only lockfiles + workspace config
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node packages ./packages
COPY --chown=node:node apps/frontend/package.json ./apps/frontend/package.json

# Download everything to global store (network-heavy, but cached forever)
RUN --mount=type=cache,target=/app/.pnpm-store,uid=1000,gid=1000 \
    pnpm fetch --frozen-lockfile

# ─── 3. Installer – 100% offline install ───────────────────────────────────
FROM base AS installer

COPY --chown=node:node --from=fetcher /app ./

# Install from store only – no network never touched again
RUN --mount=type=cache,target=/app/.pnpm-store,uid=1000,gid=1000 \
    CI=true pnpm install -r --offline --frozen-lockfile --shamefully-hoist

# ─── 4. Builder – compile frontend ────────────────────────────────────────
FROM base AS builder

COPY --chown=node:node --from=installer /app/node_modules ./node_modules
COPY --chown=node:node --from=installer /app/packages ./packages
COPY --chown=node:node . .

# Build the frontend (Vite + TypeScript)
RUN pnpm --filter @regloom/frontend build

# ─── 5. Production Runtime (tiny nginx) ───────────────────────────────────
FROM nginx:alpine AS production

# Remove default nginx site
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

# Custom nginx config for SPA routing + gzip
COPY --chown=nginx:nginx apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost || exit 1

CMD ["nginx", "-g", "daemon off;"]

# ─── 6. Development Stage (hot reload + perfect logs) ───────────────────────
FROM node:20-slim AS dev

ENV NODE_ENV=development

RUN npm i -g pnpm@10.24.0

WORKDIR /app

# Recreate dirs & ownership
RUN mkdir -p /logs /app/.pnpm-store /app/apps/uploads && \
    chown -R node:node /app /logs /app/.pnpm-store

USER node

# Reuse same store path
RUN pnpm config set store-dir /app/.pnpm-store

# Copy fully installed deps (offline)
COPY --from=installer --chown=node:node /app/node_modules ./node_modules
COPY --from=installer --chown=node:node /app/packages ./packages
COPY --from=installer --chown=node:node /app/pnpm-lock.yaml ./
COPY --from=installer --chown=node:node /app/pnpm-workspace.yaml ./
COPY --from=installer --chown=node:node /app/tsconfig.json ./

# Copy source (mounted in compose for hot reload)
COPY --chown=node:node . .

EXPOSE 3000

ENV CHOKIDAR_USEPOLLING=true
ENV LOG_LEVEL=debug
ENV LOG_DIR=/logs
ENV SERVICE_NAME=frontend

CMD ["pnpm", "--filter", "@regloom/frontend", "dev", "--host", "0.0.0.0"]