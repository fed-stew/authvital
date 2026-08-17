# syntax=docker/dockerfile:1
# =============================================================================
# examples/spa-react — "My Local App" SPA
# =============================================================================
# Build context is the REPO ROOT (see docker-compose.examples.yml) because this
# app consumes the LOCAL workspace SDKs in packages/. We copy only the packages
# this app needs to keep the image lean (no backend/prisma toolchain), install
# the workspaces, build the SDKs, then build + statically serve the Vite bundle.

# ---- build stage -----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /repo

# Root manifests drive npm workspace resolution.
COPY package.json package-lock.json tsconfig.json ./

# Only the workspace packages in this app's dependency graph:
#   @authvital/browser -> @authvital/core (sdk-core) + @authvital/shared
COPY packages/shared ./packages/shared
COPY packages/sdk-core ./packages/sdk-core
COPY packages/sdk-browser ./packages/sdk-browser
COPY examples/spa-react ./examples/spa-react

# Vite bakes VITE_* env at build time. Defaults match the seeded client;
# override via docker-compose build args if needed.
ARG VITE_AV_HOST=https://auth.lvh.me
ARG VITE_AV_CLIENT_ID=local-spa-client-id
ENV VITE_AV_HOST=$VITE_AV_HOST
ENV VITE_AV_CLIENT_ID=$VITE_AV_CLIENT_ID

# Install (dev deps included — needed for the SDK + Vite builds).
RUN npm install --no-audit --no-fund

# Build SDKs bottom-up, then the app.
RUN npm run build -w @authvital/shared \
 && npm run build -w @authvital/core \
 && npm run build -w @authvital/browser \
 && npm run build -w @authvital/example-spa-react

# ---- runtime stage ---------------------------------------------------------
FROM nginx:alpine AS runtime
COPY examples/spa-react/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/examples/spa-react/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
