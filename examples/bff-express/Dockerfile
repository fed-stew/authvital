# syntax=docker/dockerfile:1
# =============================================================================
# examples/bff-express — Express BFF (PKCE, encrypted sessions, webhooks, M2M)
# =============================================================================
# Build context is the REPO ROOT (see docker-compose.examples.yml) so the local
# workspace SDKs are available. Single stage keeps it simple for a dev example:
# install workspaces, build the SDKs + BFF, then run the compiled JS on :3000
# (the port the bff-express Traefik label targets).

FROM node:20-alpine
WORKDIR /repo
ENV NODE_ENV=production

COPY package.json package-lock.json tsconfig.json ./

# Only the workspace packages in this app's dependency graph:
#   @authvital/server -> @authvital/core (sdk-core) + @authvital/shared
COPY packages/shared ./packages/shared
COPY packages/sdk-core ./packages/sdk-core
COPY packages/sdk-server ./packages/sdk-server
COPY examples/bff-express ./examples/bff-express

# NODE_ENV=production still installs devDeps here because we need tsc/tsup to
# build; --include=dev makes that explicit and future-proof.
RUN npm install --include=dev --no-audit --no-fund \
 && npm run build -w @authvital/shared \
 && npm run build -w @authvital/core \
 && npm run build -w @authvital/server \
 && npm run build -w @authvital/example-bff-express

EXPOSE 3000
CMD ["node", "examples/bff-express/dist/index.js"]
