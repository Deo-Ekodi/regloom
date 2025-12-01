# apps/rule-engine/Dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

RUN mkdir -p /logs /app/apps/rule-engine && \
    chown -R node:node /logs /app/apps/rule-engine /app
USER node

COPY tsconfig.json ./

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/rule-engine/package.json ./apps/rule-engine/package.json
COPY packages ./packages

# Install everything (including shared packages)
RUN pnpm install --recursive --frozen-lockfile

FROM base AS builder
COPY . .
RUN pnpm --filter @regloom/rule-engine build

# DEV STAGE — HOT RELOAD WORKING
FROM node:20-alpine AS dev
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/tsconfig.json ./tsconfig.json
COPY --from=base /app/pnpm-workspace.yaml ./
COPY --from=base /app/apps/rule-engine ./apps/rule-engine

# Ensure ts-node can resolve .ts files from shared packages
ENV NODE_OPTIONS="--loader ts-node/esm --no-warnings"

# Let docker-compose.override.yml run the correct pnpm dev command
CMD ["tail", "-f", "/dev/null"]