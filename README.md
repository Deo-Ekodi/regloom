````markdown
# RegLoom — Privacy-Preserving Regulatory Intelligence Platform

RegLoom is a comprehensive monorepo structured to support a privacy-preserving regulatory intelligence platform. It consists of multiple independent applications (apps) and shared packages, managed using **pnpm workspaces** and containerized with **Docker Compose** for local development.

---

## 🚀 Getting Started (Development Setup)

This project uses **pnpm** for dependency management and **Docker Compose** for local development orchestration, including a PostgreSQL database via Supabase.

### 1. Prerequisites

You must have the following installed on your machine:
* **Node.js** (v20+)
* **pnpm** (installed globally)
* **Docker** and **Docker Compose**

### 2. Initial Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd regloom
    ```
2.  **Configure Environment Variables:**
    ```bash
    cp .env.example .env
    # Edit the .env file if necessary, but defaults work with docker-compose.yml
    ```
3.  **Build and Run the Stack:**
    The Docker Compose setup builds the necessary application images and starts all services (frontend, backend, engines, and the PostgreSQL database).
    ```bash
    docker compose up --build
    ```

### 3. Accessing the Application

Once the services are running:

* **Frontend (Dashboard):** Open your browser to `http://localhost:3000`
* **Backend Services:** Internal access on port 4000 (for local testing only)

---

## 🌳 Monorepo Architecture Overview

This project is organized into three main top-level directories: `apps/` for deployable services, `packages/` for shared code, and `infra/` for deployment and operations configurations.

### 1. Core Structure

````plaintext

.
├── apps/                 \# All deployable applications/services
├── packages/             \# Reusable internal libraries/shared code
├── infra/                \# Infrastructure-as-Code (Docker, K8s, CI/CD)
├── node\_modules/         \# Root-level pnpm modules (shared dev dependencies)
├── docker-compose.yml    \# Local development stack definition
├── pnpm-workspace.yaml   \# Defines the monorepo structure
└── tsconfig.json         \# Root TypeScript configuration (defines path aliases)

````

### 2. `apps/` Directory (The Services)

The `apps/` directory contains all independent, deployable services:

| Application | Technology | Role | Entry Point |
| :--- | :--- | :--- | :--- |
| **frontend/** | React, Vite, TypeScript | Presentation Layer: User dashboard. | `apps/frontend/src/main.tsx` |
| **backend/** | Express, TS, Supabase | Application Services & Orchestration, API Gateway. | `apps/backend/src/index.ts` |
| **privacy-engine/** | Express, TS, Supabase | Isolated Data & Privacy Layer (e.g., FHE/ZK Proof handlers). | `apps/privacy-engine/src/index.ts` |
| **rule-engine/** | Express, TS, Supabase | Isolated Business Logic: Rule parsing and enforcement. | `apps/rule-engine/src/index.ts` |
| **synth-gen/** | Python 3.12 | Data & Privacy: AI/ML service for generating synthetic data. | `apps/synth-gen/main.py` |

### 3. `packages/` Directory (Shared Libraries)

Shared libraries are referenced by applications using the **path alias** `@regloom/*` defined in `tsconfig.json`.

| Package | Role | Reference |
| :--- | :--- | :--- |
| **config/** | Shared configuration for tools (e.g., ESLint, Prettier). | `@regloom/config` |
| **types/** | Shared TypeScript interfaces and utility types. | `@regloom/types` |
| **utils/** | Common utility functions and helper classes. | `@regloom/utils` |

### 4. `infra/` Directory (Operations)

This layer holds configurations for deploying and running the application in production:

* **ci-cd/**: GitHub Actions workflows (`test.yml`, `deploy.yml`).
* **k8s/**: Helm chart structure for Kubernetes deployment.
* **monitoring/**: Configuration files for observability tools (e.g., `prometheus.yml`).

---

## 🛠️ Contribution Guide

### Adding Dependencies

All dependencies are managed by **pnpm**. Do not use `npm` or `yarn`.

1.  **Project-Specific Dependency:** To add a dependency (e.g., `axios`) to a specific application (e.g., `backend`):
    ```bash
    pnpm add axios --filter @regloom/backend
    ```
2.  **Shared Development Dependency:** To add a tool or linter (e.g., `jest`) available across all projects:
    ```bash
    pnpm add -Dw jest
    ```
3.  **Shared Internal Package:** Dependencies for a shared package (e.g., `@regloom/utils`) are added by filtering to that package:
    ```bash
    pnpm add lodash --filter @regloom/utils
    ```

### How Services Run Locally (Docker-Native)

The local environment is entirely containerized:

1.  **Build Stage (`FROM ... AS base`):** The initial Docker stage copies the root lockfile and relevant `package.json` files, then runs `pnpm install` once at the root **inside the container**. This creates a shared `node_modules` structure inside the container.
2.  **Development Stage (`FROM ... AS dev`):** The development stage copies the shared `node_modules` and all source code.
3.  **Hot-Reload (HMR):**
    * **Docker Volumes:** The `docker-compose.yml` mounts the host source code (`./apps/*`) into the container's `/app/apps/*` to enable hot-reloading.
    * **Anonymous Volumes:** The entry ` /app/apps/frontend/node_modules` prevents the host volume mount from overwriting the necessary `node_modules` binaries inside the container.
    * **Start Command:** The `docker-compose.override.yml` provides the actual run command (e.g., `pnpm --filter @regloom/backend dev`) to start the service with live-reloading tools (`ts-node-dev` or `vite`).

### TypeScript Path Mapping

Inter-package imports (e.g., importing a type from `@regloom/types` into `apps/backend`) are handled by the root **`tsconfig.json`** using path aliases:

```json
"paths": { "@regloom/*": ["packages/*/src"] },
````

This configuration allows you to import code from shared packages as if they were standard NPM packages:

```typescript
import { User } from '@regloom/types';
import { hash } from '@regloom/utils';
```

-----

## 🌲 Full Directory Structure (Current State)

This represents the current, generated file and directory layout:

```plaintext
.
├── apps
│   ├── backend
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── src
│   │   │   ├── controllers
│   │   │   ├── index.ts
│   │   │   ├── middlewares
│   │   │   ├── services
│   │   │   └── utils
│   │   ├── tests
│   │   └── tsconfig.build.json
│   ├── frontend
│   │   ├── Dockerfile
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── public
│   │   ├── src
│   │   │   ├── api
│   │   │   ├── components
│   │   │   ├── main.tsx
│   │   │   ├── pages
│   │   │   └── utils
│   │   └── vite.config.ts
│   ├── privacy-engine
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── src
│   │   │   └── index.ts
│   │   └── tsconfig.build.json
│   ├── rule-engine
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── src
│   │   │   └── index.ts
│   │   └── tsconfig.build.json
│   └── synth-gen
│       ├── Dockerfile
│       ├── main.py
│       ├── pyproject.toml
│       └── src
├── docs
├── infra
│   ├── ci-cd
│   │   └── deploy.yml
│   ├── docker
│   ├── k8s
│   │   └── charts
│   │       └── regloom-chart
│   │           ├── templates
│   │           │   └── deployment.yaml
│   │           └── values.yaml
│   └── monitoring
│       └── prometheus.yml
├── packages
│   ├── config
│   │   ├── package.json
│   │   └── src
│   │       └── index.ts
│   ├── types
│   │   ├── package.json
│   │   └── src
│   │       └── index.ts
│   └── utils
│       ├── package.json
│       └── src
│           └── index.ts
├── docker-compose.override.yml
├── docker-compose.yml
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── README.md
├── reposkeleton.sh
└── tsconfig.json
```

```
```

curl -X POST http://localhost:4000/ingest \
  -H "Authorization: Bearer $(curl -s -X POST http://localhost:4000/auth/dev-login -d '{"email":"admin@regloom.dev"}' | jq -r .access_token)" \
  -F "file=@customers.csv" \
  -F "source=csv"

curl -X POST http://localhost:4000/weave \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(curl -s -X POST http://localhost:4000/auth/dev-login -d '{"email":"admin@regloom.dev"}' | jq -r .access_token)" \
  -d "{
    \"data\": [
      {\"customer_id\": \"CUST-001\", \"age\": 28, \"gender\": \"Female\", \"salary\": 65000, \"email\": \"jane@corp.com\"},
      {\"customer_id\": \"CUST-002\", \"age\": 45, \"gender\": \"Male\", \"salary\": 110000, \"email\": \"john@corp.com\"}
    ],
    \"regulations\": [\"gdpr\", \"ccpa\"],
    \"userId\": \"admin-dev\",
    \"timestamp\": \"2025-12-05T18:00:00Z\",
    \"source\": \"direct\"
  }"

curl -X POST http://localhost:4000/weave \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(curl -s -X POST http://localhost:4000/auth/dev-login -d '{"email":"admin@regloom.dev"}' | jq -r .access_token)" \
  -d '{
    "source": "csv",
    "connectorParams": { "filePath": "uploads/customers.csv" },
    "regulations": ["kenya_dpa", "gdpr"],
    "userId": "user123",
    "timestamp": "2025-12-07T10:00:00Z"
  }'


curl -X POST http://localhost:4000/weave \
  -H "Authorization: Bearer $(curl -s -X POST http://localhost:4000/auth/dev-login -d '{"email":"admin@regloom.dev"}' | jq -r .access_token)" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@customers.csv" \
  -F "source=csv" \
  -F "connectorParams={\"delimiter\":\",\"}" \
  -F "regulations=[\"kenya_dpa\",\"gdpr\"]" \
  -F "userId=dummyUser123" \
  -F "timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  -F "options={\"maxRows\":1000,\"dryRun\":false}"