# apps/backend/Dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY tsconfig.json ./

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY packages ./packages

# Install everything (including shared packages)
RUN pnpm install --recursive --frozen-lockfile

FROM base AS builder
COPY . .
RUN pnpm --filter @regloom/backend build

# DEV STAGE — HOT RELOAD WORKING
FROM node:20-alpine AS dev
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/tsconfig.json ./tsconfig.json
COPY --from=base /app/pnpm-workspace.yaml ./
COPY --from=base /app/apps/backend ./apps/backend

# Ensure ts-node can resolve .ts files from shared packages
ENV NODE_OPTIONS="--loader ts-node/esm --no-warnings"

# Let docker-compose.override.yml run the correct pnpm dev command
CMD ["tail", "-f", "/dev/null"]