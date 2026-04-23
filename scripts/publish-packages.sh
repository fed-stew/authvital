#!/bin/bash
set -e

echo "Building packages..."
npm run build -w @authvital/shared
npm run build -w @authvital/contracts
npm run build -w @authvital/node
npm run build -w @authvital/react

echo "Publishing packages..."
npm publish -w @authvital/shared --access public
npm publish -w @authvital/contracts --access public
npm publish -w @authvital/node --access public
npm publish -w @authvital/react --access public

echo "All packages published!"
