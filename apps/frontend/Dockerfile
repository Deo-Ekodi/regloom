# Full dev + build stage
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json ./apps/frontend/package.json
RUN pnpm install --recursive --frozen-lockfile --production=false
COPY . .
RUN pnpm --filter @regloom/frontend build

# DEV MODE — keeps everything (pnpm, node_modules, source)
FROM builder AS dev
WORKDIR /app/apps/frontend
CMD ["pnpm", "dev"]

# PRODUCTION MODE
FROM nginx:alpine AS prod
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
