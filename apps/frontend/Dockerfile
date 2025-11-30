FROM node:20-alpine AS builder
# Use correct pnpm versioning for corepack
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app
# Copy lockfile and workspace config (caching layer 1)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Copy app package.json (caching layer 2)
COPY apps/frontend/package.json ./apps/frontend/package.json
# Install all dependencies at the root
RUN pnpm install --recursive --frozen-lockfile --production=false
# Copy source code
COPY . .
# Build step for production builder
RUN pnpm --filter @regloom/frontend build

# DEV STAGE: Fixes bin path issue
FROM node:20-alpine AS dev
# Activate pnpm and set up path
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app
# Copy node_modules from builder for executables
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/pnpm-workspace.yaml .
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY packages ./packages
COPY apps/frontend ./apps/frontend

# Set up the run command, using pnpm filter is safer than just 'vite'
WORKDIR /app 
CMD ["pnpm", "--filter", "@regloom/frontend", "dev"]

FROM nginx:alpine AS prod
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
