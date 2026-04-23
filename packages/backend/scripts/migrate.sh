#!/bin/sh
set -e

# =============================================================================
# AuthVital — Migration & Bootstrap Entrypoint
# =============================================================================
# Runs Prisma migrations and bootstrap checks, then exits.
# Designed to run as a one-shot service before the API starts.
#
# In docker-compose: the "migrate" service runs this, and the "api" service
# depends on it via `condition: service_completed_successfully`.
#
# In CI/CD: run this as a Cloud Run Job before deploying the API service.
# =============================================================================

# Build DATABASE_URL from components if individual vars are set (Cloud SQL, etc.)
if [ -n "$DB_HOST" ]; then
  ENCODED_PASSWORD=$(node -e "console.log(encodeURIComponent(process.env.DB_PASSWORD))")

  # Cloud SQL socket path (starts with /)
  if echo "$DB_HOST" | grep -q '^/'; then
    export DATABASE_URL="postgresql://${DB_USERNAME}:${ENCODED_PASSWORD}@localhost/${DB_DATABASE}?host=${DB_HOST}"
    echo "DATABASE_URL constructed for Cloud SQL socket"
  else
    export DATABASE_URL="postgresql://${DB_USERNAME}:${ENCODED_PASSWORD}@${DB_HOST}:5432/${DB_DATABASE}"
    echo "DATABASE_URL constructed for TCP connection"
  fi
fi

echo "=========================================="
echo "AuthVital — Running migrations"
echo "=========================================="

echo ""
echo "[1/2] Prisma migrate deploy..."
node ./node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema

echo ""
echo "[2/2] Bootstrap checks (super admin, system roles)..."
node dist/src/migrate-runner.js

echo ""
echo "=========================================="
echo "Migrations complete — exiting"
echo "=========================================="
