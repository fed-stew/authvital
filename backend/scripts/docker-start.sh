#!/bin/sh
set -e

# =============================================================================
# AuthVader Docker Entrypoint
# =============================================================================
#
# RUN_MODE options:
#   - full       : Run migrations + bootstrap, then start API (default)
#   - production : Start API only (skip migrations/bootstrap)
#   - migration  : Run migrations + bootstrap, then exit
#
# =============================================================================

RUN_MODE=${RUN_MODE:-full}

# Build DATABASE_URL from components (for Cloud SQL socket or standard)
if [ -n "$DB_HOST" ]; then
  ENCODED_PASSWORD=$(node -e "console.log(encodeURIComponent(process.env.DB_PASSWORD))")
  
  # Check if DB_HOST is a socket path (starts with /)
  if echo "$DB_HOST" | grep -q '^/'; then
    export DATABASE_URL="postgresql://${DB_USERNAME}:${ENCODED_PASSWORD}@localhost/${DB_DATABASE}?host=${DB_HOST}"
    echo "DATABASE_URL constructed for Cloud SQL socket"
  else
    export DATABASE_URL="postgresql://${DB_USERNAME}:${ENCODED_PASSWORD}@${DB_HOST}:5432/${DB_DATABASE}"
    echo "DATABASE_URL constructed for TCP connection"
  fi
fi

echo "=========================================="
echo "AuthVader - RUN_MODE: ${RUN_MODE}"
echo "=========================================="

# ---------------------------------------------------------------------------
# Migration + Bootstrap
# ---------------------------------------------------------------------------
run_migrations() {
  echo ""
  echo "[1/2] Running Prisma migrations..."
  node ./node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma
  
  echo ""
  echo "[2/2] Running bootstrap checks..."
  node dist/src/migrate-runner.js
  
  echo ""
  echo "Migration and bootstrap complete!"
}

# ---------------------------------------------------------------------------
# Start API
# ---------------------------------------------------------------------------
start_api() {
  echo ""
  echo "Starting AuthVader API on port ${PORT:-8000}..."
  exec node dist/src/main.js
}

# ---------------------------------------------------------------------------
# Run based on mode
# ---------------------------------------------------------------------------
case "$RUN_MODE" in
  full)
    run_migrations
    start_api
    ;;
  production)
    start_api
    ;;
  migration)
    run_migrations
    echo "Exiting after migrations (RUN_MODE=migration)"
    exit 0
    ;;
  *)
    echo "ERROR: Unknown RUN_MODE '${RUN_MODE}'"
    echo "Valid options: full, production, migration"
    exit 1
    ;;
esac
