#!/bin/sh
set -e

# =============================================================================
# AuthVital — API Entrypoint
# =============================================================================
# Starts the NestJS API server. That's it.
#
# Migrations are handled by a separate service (see docker-compose.yml).
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
echo "AuthVital API — starting on port ${PORT:-8000}"
echo "=========================================="

exec node dist/src/main.js
