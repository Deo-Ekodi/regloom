#!/bin/bash
set -e
echo "REGLOOM — SPRINT 0 + 1: ERROR MITIGATION & DOCKER-NATIVE SKELETON READY"
echo "Running in: $(pwd)"

# ------------------------------------------------------------------
# 1. Root setup
# ------------------------------------------------------------------
[ -f package.json ] || pnpm init -y 2>/dev/null || pnpm init

cat > pnpm-workspace.yaml <<'EOF'
packages:
  - 'apps/*'
  - 'packages/*'
EOF

cat > .gitignore <<'EOF'
node_modules
.pnp.*
.env*
dist
build
__pycache__
.venv
venv
supabase
.docker
.DS_Store
EOF

cat > .env.example <<'EOF'
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
EOF

# ------------------------------------------------------------------
# 2. Directories
# ------------------------------------------------------------------
mkdir -p docs

# Frontend
mkdir -p apps/frontend/public
for dir in components pages api utils; do
    mkdir -p apps/frontend/src/$dir
done

# Backend
mkdir -p apps/backend/tests
for dir in services controllers middlewares utils; do
    mkdir -p apps/backend/src/$dir
done

# Other apps
mkdir -p apps/privacy-engine/src apps/rule-engine/src apps/synth-gen/src

# Packages
for pkg in utils types config; do
    mkdir -p packages/$pkg/src
done

# INFRASTRUCTURE LAYER
mkdir -p infra/docker
mkdir -p infra/k8s/charts/regloom-chart/templates
mkdir -p infra/ci-cd
mkdir -p infra/monitoring
mkdir -p .github/workflows

# ------------------------------------------------------------------
# 3. package.json files (Node.js apps)
# ------------------------------------------------------------------
cat > apps/frontend/package.json <<'EOF'
{
  "name": "@regloom/frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "latest",
    "react-dom": "latest",
    "@supabase/supabase-js": "latest"
  },
  "devDependencies": {
    "vite": "latest",
    "@vitejs/plugin-react": "latest"
  }
}
EOF

for app in backend privacy-engine rule-engine; do
  cat > apps/$app/package.json <<EOF
{
  "name": "@regloom/$app",
  "private": true,
  "main": "dist/index.js",
  "scripts": {
    "dev": "ts-node-dev src/index.ts",
    "build": "tsc --build tsconfig.build.json"
  },
  "dependencies": {
    "express": "latest",
    "@supabase/supabase-js": "latest"
  },
  "devDependencies": {
    "typescript": "latest",
    "ts-node": "latest",
    "ts-node-dev": "latest"
  }
}
EOF

  cat > apps/$app/tsconfig.build.json <<'EOF'
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "outDir": "./dist" },
  "include": ["src/**/*"]
}
EOF

  # FIX: Implement a minimal Express server to keep the process alive
  cat > apps/$app/src/index.ts <<EOF
import express from 'express';

const app = express();
const PORT = 4000; // Using a fixed port for simplicity, backend service maps 4000:4000

app.get('/', (req, res) => {
  res.send('$app service is alive!');
});

app.listen(PORT, () => {
  console.log(\`$app service is running on port \${PORT}\`);
});
EOF
done

for pkg in utils types config; do
  cat > packages/$pkg/package.json <<EOF
{
  "name": "@regloom/$pkg",
  "version": "0.0.1",
  "main": "src/index.ts"
}
EOF
  echo "// Shared $pkg package — TODO: implement" > packages/$pkg/src/index.ts
done

# ------------------------------------------------------------------
# 4. Frontend files
# ------------------------------------------------------------------
cat > apps/frontend/vite.config.ts <<'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: 'public',
  server: {
    host: true,
    port: 3000,
    watch: { usePolling: true }
  }
})
EOF

cat > apps/frontend/index.html <<'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RegLoom Frontend</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF

echo "import React from 'react'; import ReactDOM from 'react-dom/client'; ReactDOM.createRoot(document.getElementById('root')!).render(<h1>RegLoom Ready!</h1>);" > apps/frontend/src/main.tsx

# ------------------------------------------------------------------
# 5. Root deps + tsconfig + Install
# ------------------------------------------------------------------
pnpm add -Dw typescript ts-node ts-node-dev vite @vitejs/plugin-react express eslint prettier

cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": { "@regloom/*": ["packages/*/src"] },
    "jsx": "react-jsx"
  },
  "exclude": ["node_modules", "dist", "apps/*/dist", "**/*.test.ts"]
}
EOF

echo "Installing dependencies locally..."
pnpm install

# ------------------------------------------------------------------
# 6. Docker Compose — dev target (Ensuring correct YAML mapping)
# ------------------------------------------------------------------
# FIX APPLIED: Retained anonymous volumes for node_modules to prevent host volume mount from hiding container dependencies.
cat > docker-compose.yml <<'EOF'
services:
  db:
    image: supabase/postgres:15.1.1.43
    ports: ["54321:5432"]
    environment:
      POSTGRES_PASSWORD: postgres
    volumes:
      - db_data:/var/lib/postgresql/data

  frontend:
    build:
      context: .
      dockerfile: apps/frontend/Dockerfile
      target: dev
    ports: ["3000:3000"]
    volumes: 
      - ./apps/frontend:/app/apps/frontend # Map app to its correct location
      - /app/apps/frontend/node_modules    # Prevent masking of deps
      - ./.env.example:/app/.env.example
    environment:
      - CHOKIDAR_USEPOLLING=true
    depends_on: [db]

  backend:
    build:
      context: .
      dockerfile: apps/backend/Dockerfile
      target: dev
    ports: ["4000:4000"]
    volumes: 
      - ./apps/backend:/app/apps/backend
      - /app/apps/backend/node_modules     # Prevent masking of deps
    environment:
      - NODE_ENV=development
    depends_on: [db]

  privacy-engine:
    build:
      context: .
      dockerfile: apps/privacy-engine/Dockerfile
      target: dev
    volumes: 
      - ./apps/privacy-engine:/app/apps/privacy-engine
      - /app/apps/privacy-engine/node_modules

  rule-engine:
    build:
      context: .
      dockerfile: apps/rule-engine/Dockerfile
      target: dev
    volumes: 
      - ./apps/rule-engine:/app/apps/rule-engine
      - /app/apps/rule-engine/node_modules

  synth-gen:
    build:
      context: .
      dockerfile: apps/synth-gen/Dockerfile
      target: dev 
    volumes: 
      - ./apps/synth-gen:/app/apps/synth-gen
      # Python usually installs to global site-packages in container.

volumes:
  db_data:
EOF

cat > docker-compose.override.yml <<'EOF'
services:
  frontend:
    command: pnpm --filter @regloom/frontend dev
  backend:
    command: pnpm --filter @regloom/backend dev
  privacy-engine:
    command: pnpm --filter @regloom/privacy-engine dev
  rule-engine:
    command: pnpm --filter @regloom/rule-engine dev
  synth-gen:
    # FIX: Use tail -f /dev/null to keep the Python dev container running
    command: tail -f /dev/null
EOF

# ------------------------------------------------------------------
# 7. Dockerfiles — clean, working, dev + prod
# ------------------------------------------------------------------
# NOTE: Using WORKDIR /app in base/builder, but the dev command runs
# inside the specific app folder. We must ensure executables are found.

cat > apps/frontend/Dockerfile <<'EOF'
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
FROM node:20-slim AS dev
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
EOF

for app in backend privacy-engine rule-engine; do
cat > apps/$app/Dockerfile <<EOF
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/$app/package.json ./apps/$app/package.json
RUN pnpm install --recursive --frozen-lockfile --production=false

FROM base AS builder
COPY . .
WORKDIR /app/apps/$app
RUN pnpm build

# DEV STAGE: Fixes bin path issue
FROM node:20-slim AS dev
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app
# Copy necessary node_modules structure for running dev scripts from base
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/pnpm-workspace.yaml .
COPY apps/$app/package.json ./apps/$app/package.json
COPY packages ./packages
COPY apps/$app ./apps/$app

# The command is now handled by docker-compose.override.yml and runs from /app
CMD ["tail", "-f", "/dev/null"] 

# Use a placeholder command here, as the actual run command is in override for hot-reload
# The volumes mount the app code directly, making the previous COPY steps mainly for build context.

FROM builder AS prod
WORKDIR /app
COPY --from=builder /app/apps/$app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
# FIX: The Express server is the long-running process
CMD ["node", "dist/index.js"]
EOF
done

# ------------------------------------------------------------------
# 7.1 synth-gen — DOCKER-NATIVE with pyproject.toml
# ------------------------------------------------------------------
# Create minimal pyproject.toml (empty dependencies list - handles skeleton build)
cat > apps/synth-gen/pyproject.toml <<'EOF'
[project]
name = "synth-gen"
version = "0.1.0"
dependencies = []

[build-system]
requires = ["setuptools>=61.0.0"]
build-backend = "setuptools.build_meta"
EOF

# Ensure requirements.txt is deleted/removed, as it's no longer needed
rm -f apps/synth-gen/requirements.txt 2>/dev/null

# Dockerfile for Python app (Multi-stage, robust build caching, pyproject.toml ONLY)
cat > apps/synth-gen/Dockerfile <<'EOF'
# BUILDER STAGE: Handle dependencies (cache layer)
FROM python:3.12-slim AS builder
WORKDIR /app
# Install build tools
RUN pip install poetry || pip install setuptools wheel
# Copy dependency files only
COPY apps/synth-gen/pyproject.toml /app/apps/synth-gen/
# Install dependencies from pyproject.toml (will succeed even if empty)
# Use a temporary directory to treat it as an installable package
WORKDIR /app/apps/synth-gen
RUN pip install --no-cache-dir .

# DEV STAGE: Full environment for development
FROM builder AS dev
WORKDIR /app
# Copy the entire workspace structure
COPY . . 
# Set environment variable for unbuffered output
ENV PYTHONUNBUFFERED=1
# Use a placeholder command, actual run command is in docker-compose.override.yml
CMD ["tail", "-f", "/dev/null"] 

# PROD STAGE: Minimal runtime (defined for completeness)
FROM dev AS prod
# FIX: Use tail -f /dev/null here as well, unless a proper server is implemented
CMD ["tail", "-f", "/dev/null"]
EOF

# Keep main.py
cat > apps/synth-gen/main.py <<'EOF'
print("RegLoom synth-gen ready! (using DOCKER-NATIVE pyproject.toml build)")
EOF

# ------------------------------------------------------------------
# 8. INFRASTRUCTURE LAYER
# ------------------------------------------------------------------
cat > infra/monitoring/prometheus.yml <<'EOF'
# Prometheus configuration for RegLoom services
# TODO: Configure scrape jobs for each service
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
EOF

cat > infra/ci-cd/deploy.yml <<'EOF'
# GitHub Actions: Build, test, deploy to Railway
name: Deploy to Railway

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Railway
        run: npm i -g @railway/cli
      - name: Deploy
        run: railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
EOF

cat > .github/workflows/test.yml <<'EOF'
# Basic CI: lint + typecheck
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
EOF

cat > infra/k8s/charts/regloom-chart/values.yaml <<'EOF'
# Helm values for RegLoom deployment
replicaCount: 1
image:
  repository: railway.app/regloom
  tag: latest
service:
  type: ClusterIP
  port: 80
EOF

cat > infra/k8s/charts/regloom-chart/templates/deployment.yaml <<'EOF'
# Placeholder Helm deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: regloom
spec:
  replicas: 1
  selector:
    matchLabels:
      app: regloom
  template:
    metadata:
      labels:
        app: regloom
    spec:
      containers:
        - name: regloom
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          ports:
            - containerPort: 80
EOF

# ------------------------------------------------------------------
# 9. README + docs
# ------------------------------------------------------------------
cat > README.md <<'EOF'
# RegLoom — Privacy-Preserving Regulatory Intelligence

## Getting Started

```bash
cp .env.example .env
docker compose up --build