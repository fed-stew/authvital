#!/usr/bin/env bash
# =============================================================================
# reset-examples.sh — Fresh reset of the examples/UAT environment
# =============================================================================
#
# Postgres now lives in a NAMED VOLUME (authvital-pgdata), so a clean reset is
# just `docker compose ... down -v`: it drops the volume and the next `up`
# re-runs the idempotent bootstrap seed against a brand-new DB. That also nukes
# the old stale-issuer footgun for free — a fresh volume is seeded directly
# against https://auth.lvh.me, no lingering http://localhost:8080 keys.
#
# The blessed command is `make fresh` (down -v + up). This script is the
# equivalent for the `npm run fresh:examples` / `npm run reset:examples` path
# and keeps the confirm prompt because it is DESTRUCTIVE (all local users,
# tenants, tokens are wiped). Local dev only.
#
# Usage:
#     npm run fresh:examples      # or: npm run reset:examples
#     # or:  bash scripts/reset-examples.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LEGACY_DATA_DIR="$PROJECT_ROOT/data"
POSTGRES_PORT="${POSTGRES_PORT:-5433}"
export POSTGRES_PORT

cd "$PROJECT_ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.examples.yml)

echo "=============================================================="
echo " AuthVital examples reset (named volume)"
echo "=============================================================="
echo "This will:"
echo "  1. Stop the examples compose stack and REMOVE its data volume"
echo "     ( ${COMPOSE[*]} down -v )"
echo "  2. Leave you ready to re-seed a fresh DB on the next 'make up'"
echo ""
echo "  All local Postgres data (users, tenants, tokens) will be lost."
echo "=============================================================="
read -r -p "Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted. Nothing was deleted."
  exit 1
fi

echo "==> Bringing the examples stack down and dropping the named volume..."
"${COMPOSE[@]}" down -v || true

# ---------------------------------------------------------------------------
# Legacy ./data bind-mount cleanup (best-effort).
# Older versions bind-mounted Postgres to ./data/postgres. The named volume is
# now the single source of truth, so any leftover ./data is orphaned and unused.
# We don't delete it silently — we just point it out and offer to remove it.
# ---------------------------------------------------------------------------
if [ -d "$LEGACY_DATA_DIR" ]; then
  echo ""
  echo "==> Found a legacy ./data directory (old bind-mount data)."
  echo "    It is ORPHANED now — the named volume 'authvital-pgdata' is the source of truth."
  read -r -p "    Remove ./data too? [y/N]: " RM_LEGACY
  if [ "$RM_LEGACY" = "y" ] || [ "$RM_LEGACY" = "Y" ]; then
    rm -rf "$LEGACY_DATA_DIR"
    echo "    Removed $LEGACY_DATA_DIR."
  else
    echo "    Left $LEGACY_DATA_DIR in place (harmless; nothing mounts it)."
  fi
fi

echo ""
echo "Reset complete. Next boot re-seeds a fresh DB:"
echo "    make up          # or: npm run dev:examples"
