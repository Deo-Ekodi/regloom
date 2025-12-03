# apps/frontend/Dockerfile
# ────────────────────────
# Uses pnpm@10.24.0 (matches your root packageManager)
# Zero network calls during build (no Corepack download → no ETIMEDOUT)
# Logs work perfectly with ./logs:/logs mount
# Hot reload works instantly
# Fully cacheable layers

FROM node:20-alpine AS base

# ─── 1. Install exact pnpm version from package.json (no network, no timeout) ───
ENV PNPM_VERSION=10.24.0
RUN npm install -g pnpm@${PNPM_VERSION} && \
    corepack enable && \
    corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

# ─── 2. Prepare directories + permissions early ───
RUN mkdir -p /logs && \
    chown -R node:node /app /logs

USER node

# ─── 3. Copy only what’s needed for install (max Docker cache) ───
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/frontend/package.json ./apps/frontend/package.json
COPY --chown=node:node packages ./packages

# ─── 4. Install deps (fast + reliable) ───
RUN pnpm install \
    --recursive \
    --frozen-lockfile \
    --prefer-offline \
    --production=false

# ─── BUILDER STAGE ───
FROM base AS builder

COPY --chown=node:node . .
RUN pnpm --filter @regloom/frontend build

# ─── DEV STAGE (hot reload + logging) ───
FROM node:20-alpine AS dev

ENV NODE_ENV=development
ENV PNPM_VERSION=10.24.0

# Install exact pnpm version (no network call)
RUN npm install -g pnpm@${PNPM_VERSION} && \
    corepack enable && \
    corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

# Create and own /logs directory
RUN mkdir -p /logs && \
    chown -R node:node /app /logs

USER node

# Copy installed node_modules + packages from base (fast & cached)
COPY --from=base --chown=node:node /app/node_modules ./node_modules
COPY --from=base --chown=node:node /app/packages ./packages
COPY --from=base --chown=node:node /app/pnpm-lock.yaml ./
COPY --from=base --chown=node:node /app/pnpm-workspace.yaml ./

# Copy source code
COPY --from=builder --chown=node:node /app/apps/frontend ./apps/frontend
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/tsconfig.json ./       # if needed

# Expose Vite default port
EXPOSE 3000

# Optional: show logs nicely in dev
ENV CHOKIDAR_USEPOLLING=true
ENV LOG_LEVEL=debug
ENV LOG_DIR=/logs
ENV SERVICE_NAME=frontend

# Run Vite dev server with hot reload
CMD ["pnpm", "--filter", "@regloom/frontend", "dev", "--host", "0.0.0.0"]