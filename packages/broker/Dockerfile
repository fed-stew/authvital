# =============================================================================
# AuthVital Broker - Docker Image
#
# BUILD CONTEXT: repository root (the broker reuses the backend's Prisma
# schema to generate the shared client), e.g.:
#   docker build -f packages/broker/Dockerfile .
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build
# -----------------------------------------------------------------------------
FROM node:24-alpine AS builder

WORKDIR /app

# Copy workspace manifests (broker only — it has no workspace-package deps)
COPY package*.json ./
COPY packages/broker/package.json ./packages/broker/

# Install dependencies (including dev deps for build)
RUN npm install --legacy-peer-deps

# Copy the BACKEND prisma schema — single source of truth for the DB client.
# The generator outputs to the hoisted root node_modules/.prisma/client.
COPY packages/backend/prisma/ ./packages/backend/prisma/

# Generate Prisma client (dummy URL — generate never connects)
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate --schema packages/backend/prisma/schema

# Copy broker source & build
COPY packages/broker/ ./packages/broker/
RUN npm run build -w @authvital/broker

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
FROM node:24-alpine AS production

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
COPY packages/broker/package.json ./packages/broker/
RUN npm install --omit=dev --legacy-peer-deps

# Copy generated Prisma client from builder (hoisted at workspace root)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy built app
COPY --from=builder /app/packages/broker/dist ./packages/broker/dist

# Environment defaults
ENV NODE_ENV=production
ENV BROKER_PORT=8100

EXPOSE 8100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8100/health || exit 1

CMD ["node", "packages/broker/dist/main.js"]
