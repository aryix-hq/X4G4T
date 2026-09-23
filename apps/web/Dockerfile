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
RUN turbo prune @x4g4t/web --docker

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

# Copy source code and build Next.js application
COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json
RUN mkdir -p /app/apps/web/public
RUN pnpm --filter @x4g4t/web... build

# ----------------------------------------------------
# Stage 4: Minimal Production Runner
# ----------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
EXPOSE 3000

# Create unprivileged system user
RUN addgroup --system --gid 10001 x4g4t && \
    adduser --system --uid 10001 x4g4t

# Copy standalone Next.js server & static assets
COPY --from=builder --chown=x4g4t:x4g4t /app/apps/web/.next/standalone ./
COPY --from=builder --chown=x4g4t:x4g4t /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=x4g4t:x4g4t /app/apps/web/public ./apps/web/public

USER x4g4t

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/metrics || exit 1

CMD ["node", "apps/web/server.js"]

