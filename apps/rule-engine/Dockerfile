FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/rule-engine/package.json ./apps/rule-engine/package.json
RUN pnpm install --recursive --frozen-lockfile --production=false

FROM base AS builder
COPY . .
WORKDIR /app/apps/rule-engine
RUN pnpm build

# DEV STAGE: Fixes bin path issue
FROM node:20-alpine AS dev
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app
# Copy necessary node_modules structure for running dev scripts from base
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/pnpm-workspace.yaml .
COPY apps/rule-engine/package.json ./apps/rule-engine/package.json
COPY packages ./packages
COPY apps/rule-engine ./apps/rule-engine

# The command is now handled by docker-compose.override.yml and runs from /app
CMD ["tail", "-f", "/dev/null"] 

# Use a placeholder command here, as the actual run command is in override for hot-reload
# The volumes mount the app code directly, making the previous COPY steps mainly for build context.

FROM builder AS prod
WORKDIR /app
COPY --from=builder /app/apps/rule-engine/dist ./dist
COPY --from=base /app/node_modules ./node_modules
# FIX: The Express server is the long-running process
CMD ["node", "dist/index.js"]
