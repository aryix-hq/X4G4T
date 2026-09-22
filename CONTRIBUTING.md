# Contributing to X4G4T

Thank you for your interest in contributing to **X4G4T**! X4G4T is an open-source, ultra-low-latency AI Agent Security Firewall and Governance Gateway designed to protect enterprise infrastructure from rogue autonomous agent executions, credential theft, prompt injection, and unauthorized side effects.

We welcome contributions from developers, security engineers, SecOps practitioners, and researchers worldwide.

---

## 1. Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for all contributors. Please treat fellow maintainers and contributors with respect, empathy, and constructive feedback.

---

## 2. Monorepo Architecture

X4G4T is organized as a high-performance **pnpm + Turborepo monorepo**:

```
X4G4T/
├── apps/
│   ├── proxy/              # Fastify AI Gateway (Ingress hot path, AST eval, metrics, key injection)
│   └── web/                # Next.js 14 Web Control Plane (Policy studio, audit logs, HITL triage)
├── packages/
│   ├── policy-engine/      # Pure TypeScript AST evaluation engine, SSRF guards, DLP sanitizers
│   └── db/                 # Drizzle ORM schema definitions, migrations, and PostgreSQL client
├── docker/                 # Production Dockerfiles, Grafana provisioning, Prometheus configs
├── k8s/                    # Production Kubernetes manifests, Helm-ready ConfigMaps, CoreDNS patch
└── docs/                   # Architecture specs, benchmark reports, and deployment guides
```

---

## 3. Local Development Setup

### 3.1 Prerequisites
- **Node.js**: `v20.x` or higher
- **Package Manager**: `pnpm v9.x` (`corepack enable && corepack prepare pnpm@9.0.0 --activate`)
- **Container Runtime**: Docker Desktop 24+ & Docker Compose v2.20+

### 3.2 Clone & Install
```bash
# Clone your fork
git clone https://github.com/<your-username>/X4G4T.git
cd X4G4T

# Install monorepo dependencies
pnpm install
```

### 3.3 Spin Up Supporting Infrastructure
You can start PostgreSQL, Redis, and Elasticsearch using the included Docker Compose file:
```bash
# Start backend data layer
docker compose up -d postgres redis elasticsearch
```

### 3.4 Seed the Local Database
```bash
pnpm --filter @x4g4t/db db:push
```

### 3.5 Run Services in Development Mode
```bash
# Run Fastify Proxy (:4000)
pnpm --filter @x4g4t/proxy dev

# Run Next.js Control Plane (:3000) in another terminal
pnpm --filter @x4g4t/web dev
```

---

## 4. Testing & Verification

X4G4T maintains a **100% test pass rate requirement** across all pull requests. Every feature or bugfix should include corresponding Vitest tests.

### 4.1 Run Test Suite
```bash
# Run all unit, integration, and E2E tests across monorepo
pnpm test

# Run tests with watch mode in a specific package
pnpm --filter @x4g4t/proxy test --watch
```

### 4.2 Run Latency Benchmarks
X4G4T guarantees **<1ms AST policy evaluation**. Benchmark regressions will fail CI:
```bash
pnpm --filter @x4g4t/proxy test test/benchmark.test.ts
```

---

## 5. Pull Request Guidelines

### 5.1 Branch Naming Conventions
- `feat/feature-name` (e.g., `feat/bedrock-key-injection`)
- `fix/bug-description` (e.g., `fix/dlp-regex-edge-case`)
- `docs/doc-update` (e.g., `docs/k8s-helm-guide`)
- `perf/optimization` (e.g., `perf/in-memory-ast-caching`)

### 5.2 Conventional Commits
Please use [Conventional Commits](https://www.conventionalcommits.org/) for git messages:
- `feat(proxy): add support for AWS Bedrock reverse authentication`
- `fix(policy-engine): correct regex escaping for drop table guard`
- `test(dlp): add Luhn checksum test vectors for Amex credit cards`
- `docs(grafana): update dashboard panel layout documentation`

### 5.3 Checklist Before Submitting PR
- [ ] `pnpm build` compiles successfully with zero TypeScript errors.
- [ ] `pnpm test` runs with 100% passing tests.
- [ ] New policy engine functions have deterministic, pure unit test coverage.
- [ ] Any new Prometheus metrics are documented in [`docs/OBSERVABILITY_GRAFANA_PROVISIONING.md`](docs/OBSERVABILITY_GRAFANA_PROVISIONING.md).

---

## 6. License
By contributing to X4G4T, you agree that your contributions will be licensed under the **Apache License, Version 2.0**.

