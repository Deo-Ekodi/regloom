# Dependencies stage (prod only)
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --recursive --frozen-lockfile --prod

# Full build stage
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
WORKDIR /app/apps/privacy-engine
RUN pnpm build

# DEV MODE — full environment with source + dev deps
FROM builder AS dev
WORKDIR /app/apps/privacy-engine
CMD ["pnpm", "dev"]

# PRODUCTION MODE — minimal
FROM node:20-alpine AS prod
WORKDIR /app
COPY --from=builder /app/apps/privacy-engine/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
