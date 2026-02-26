# =============================================================================
# AuthVader - Full Stack Docker Image (Backend + Frontend)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build Frontend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Build Backend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./

# Install dependencies (including dev deps for build)
RUN npm ci --legacy-peer-deps

# Copy prisma schema (needed for generate)
COPY backend/prisma/ ./prisma/

# Generate Prisma client
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate

# Copy backend source
COPY backend/ ./

# Build backend
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: Production Image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy backend package files and install production deps
COPY backend/package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy prisma schema and migrations
COPY backend/prisma/ ./prisma/

# Copy generated Prisma client from builder
COPY --from=backend-builder /app/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=backend-builder /app/backend/node_modules/@prisma ./node_modules/@prisma
COPY --from=backend-builder /app/backend/node_modules/prisma ./node_modules/prisma

# Copy built backend
COPY --from=backend-builder /app/backend/dist ./dist

# Copy built frontend to be served by backend
COPY --from=frontend-builder /app/frontend/dist ./public

# Copy startup scripts
COPY backend/scripts/docker-start.sh ./start.sh
COPY backend/scripts/migrate.sh ./migrate.sh
RUN chmod +x ./start.sh ./migrate.sh

# Environment defaults
ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8000/api/health || exit 1

CMD ["./start.sh"]
