#!/bin/bash
set -e

echo "Building packages..."
npm run build -w @authvital/shared
npm run build -w @authvital/contracts
npm run build -w @authvital/core
npm run build -w @authvital/browser
npm run build -w @authvital/server

echo "Publishing packages..."
npm publish -w @authvital/shared --access public
npm publish -w @authvital/contracts --access public
npm publish -w @authvital/core --access public
npm publish -w @authvital/browser --access public
npm publish -w @authvital/server --access public

echo "All packages published!"
