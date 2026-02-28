# =============================================================================
# AuthVital - Full Stack Docker Image (Backend + Frontend)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build All Packages
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files for workspace
COPY package.json ./

# Copy all package.json files first (for better layer caching)
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

# Install all dependencies
RUN npm install --legacy-peer-deps

# Copy shared source and build it first
COPY packages/shared/ ./packages/shared/
RUN npm run build -w @authvital/shared

# Copy prisma schema (needed for generate)
COPY packages/backend/prisma/ ./packages/backend/prisma/

# Generate Prisma client
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN cd packages/backend && npx prisma generate

# Copy remaining source files
COPY packages/backend/ ./packages/backend/
COPY packages/frontend/ ./packages/frontend/

# Build backend and frontend
RUN npm run build -w @authvital/backend
RUN npm run build -w @authvital/frontend

# -----------------------------------------------------------------------------
# Stage 2: Production Image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy root package.json
COPY package.json ./

# Copy package.json files for workspaces
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# Install production dependencies only
RUN npm install --omit=dev --legacy-peer-deps

# Copy built shared package
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Copy prisma schema and migrations (to expected location)
COPY packages/backend/prisma/ ./prisma/

# Copy generated Prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Copy built backend (to expected location for startup script)
COPY --from=builder /app/packages/backend/dist ./dist

# Copy built frontend to be served by backend
COPY --from=builder /app/packages/frontend/dist ./public

# Copy startup scripts
COPY packages/backend/scripts/docker-start.sh ./start.sh
COPY packages/backend/scripts/migrate.sh ./migrate.sh
RUN chmod +x ./start.sh ./migrate.sh

# Environment defaults
ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8000/api/health || exit 1

CMD ["./start.sh"]
