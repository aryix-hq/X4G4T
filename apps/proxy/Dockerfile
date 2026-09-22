# ----------------------------------------------------
# Stage 1: Base Alpine Environment with pnpm
# ----------------------------------------------------
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN apk add --no-cache libc6-compat curl

# ----------------------------------------------------
# Stage 2: Turborepo Pruner
# ----------------------------------------------------
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @x4g4t/proxy --docker

# ----------------------------------------------------
# Stage 3: Builder
# ----------------------------------------------------
FROM base AS builder
WORKDIR /app

# First install dependencies (cached layer)
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile

# Copy source code and build
COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json
RUN pnpm --filter @x4g4t/proxy... build

# ----------------------------------------------------
# Stage 4: Minimal Production Runner
# ----------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Create unprivileged system user
RUN addgroup --system --gid 10001 x4g4t && \
    adduser --system --uid 10001 x4g4t

# Copy application from builder
COPY --from=builder --chown=x4g4t:x4g4t /app /app

USER x4g4t

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/healthz || exit 1

CMD ["node", "apps/proxy/dist/index.js"]
