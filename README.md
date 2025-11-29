```plaintext
.
├── apps/                      # Deployable apps (frontend, backend services)
│   ├── frontend/              # Presentation Layer: React dashboard
│   │   ├── src/               # Source code
│   │   │   ├── components/    # UI components (e.g., Canvas, ReportViewer)
│   │   │   ├── pages/         # Routes (e.g., Dashboard, WeavePage)
│   │   │   ├── api/           # Client SDK hooks
│   │   │   ├── utils/         # Helpers (e.g., auth wrappers)
│   │   │   └── index.tsx      # Entry point
│   │   ├── public/            # Static assets
│   │   ├── Dockerfile         # Build image
│   │   ├── package.json       # Deps (React, @supabase/supabase-js)
│   │   └── tsconfig.json      # TypeScript config
│   ├── backend/               # Application Services + Orchestration
│   │   ├── src/               # Source
│   │   │   ├── services/      # Microservices (e.g., api-gateway.ts, auth.ts)
│   │   │   ├── controllers/   # Handlers (e.g., weaveController.ts)
│   │   │   ├── middlewares/   # (e.g., validation.ts)
│   │   │   ├── utils/         # Shared (e.g., logger.ts)
│   │   │   └── index.ts       # Server entry
│   │   ├── tests/             # Unit/integration (e.g., auth.test.ts)
│   │   ├── Dockerfile         # Image
│   │   ├── package.json       # Deps (Express, gRPC)
│   │   └── tsconfig.json
│   ├── privacy-engine/        # Data & Privacy Layer: Isolated service
│   │   ├── src/               # (e.g., fhe.ts, zkProof.ts)
│   │   ├── Dockerfile
│   │   └── package.json       # Deps (Zama, snarkjs)
│   ├── synth-gen/             # Data & Privacy: AI synth service (Python)
│   │   ├── src/               # (e.g., gan_model.py)
│   │   ├── Dockerfile
│   │   └── requirements.txt   # Deps (TensorFlow, PyTorch)
│   └── rule-engine/           # Data & Privacy: Rule parser
│       ├── src/               # (e.g., drools_adapter.ts)
│       ├── Dockerfile
│       └── package.json
├── packages/                  # Shared libs (reusable across apps)
│   ├── utils/                 # Common utils (e.g., crypto helpers)
│   │   ├── src/               # (e.g., hashUtils.ts)
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── types/                 # Shared TypeScript types (e.g., WeaveInput)
│   │   ├── src/               # (e.g., interfaces.ts)
│   │   └── package.json
│   └── config/                # ESLint, Prettier shared configs
│       └── index.js
├── infra/                     # Deployment/ops
│   ├── docker/                # Custom Dockerfiles if needed
│   ├── k8s/                   # Helm charts (for Phase 3)
│   │   ├── charts/            # (e.g., regloom-chart/)
│   │   └── values.yaml
│   ├── ci-cd/                 # GitHub Actions workflows
│   │   └── deploy.yml         # Build/test/deploy
│   └── monitoring/            # Prometheus configs
│       └── prometheus.yml
├── docs/                      # Architecture diagrams, API specs
│   └── architecture.md        # This plan + Draw.io exports
├── .github/                   # Workflows
│   └── workflows/             # CI/CD yml files
├── docker-compose.yml         # Local stack
├── .env                       # Secrets (git ignored)
├── package.json               # Root workspaces
└── README.md                  # Setup guide
```