#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
IMAGE="authvital:local"

cd "$PROJECT_ROOT"

echo "==> Installing dependencies (workspace root)..."
npm install

echo "==> Generating Prisma client..."
cd packages/backend && npx prisma generate && cd "$PROJECT_ROOT"

echo "==> Building Docker image: $IMAGE"
docker build -t "$IMAGE" .

echo ""
echo "✅ Build complete: $IMAGE"
echo "   Run it with:  docker compose up -d"
