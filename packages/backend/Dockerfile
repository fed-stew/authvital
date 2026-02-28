# =============================================================================
# AuthVital Backend - Docker Image
# Backend-only build (use root Dockerfile for full frontend+backend)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev deps for build)
RUN npm ci --legacy-peer-deps

# Copy prisma schema (needed for generate)
COPY prisma/ ./prisma/

# Generate Prisma client
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate

# Copy source
COPY . .

# Build
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy prisma schema and migrations
COPY prisma/ ./prisma/

# Copy generated Prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy prisma CLI from builder (ensures version match)
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Copy built app
COPY --from=builder /app/dist ./dist

# Copy startup scripts
COPY scripts/docker-start.sh ./start.sh
COPY scripts/migrate.sh ./migrate.sh
RUN chmod +x ./start.sh ./migrate.sh

# Environment defaults
ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8000/api/health || exit 1

CMD ["./start.sh"]
