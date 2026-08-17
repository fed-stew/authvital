# syntax=docker/dockerfile:1
# =============================================================================
# examples/spa-seat — "Seat App" (PER_SEAT licensing UAT)
# =============================================================================
# Build context is the REPO ROOT (see docker-compose.examples.yml) so the local
# workspace SDKs are available. Same lean pattern as spa-react.

# ---- build stage -----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json tsconfig.json ./

COPY packages/shared ./packages/shared
COPY packages/sdk-core ./packages/sdk-core
COPY packages/sdk-browser ./packages/sdk-browser
COPY examples/spa-seat ./examples/spa-seat

# Vite bakes VITE_* env at build time.
ARG VITE_AV_HOST=https://auth.lvh.me
ARG VITE_AV_CLIENT_ID=seat-app-client-id
ENV VITE_AV_HOST=$VITE_AV_HOST
ENV VITE_AV_CLIENT_ID=$VITE_AV_CLIENT_ID

RUN npm install --no-audit --no-fund

RUN npm run build -w @authvital/shared \
 && npm run build -w @authvital/core \
 && npm run build -w @authvital/browser \
 && npm run build -w @authvital/example-spa-seat

# ---- runtime stage ---------------------------------------------------------
FROM nginx:alpine AS runtime
COPY examples/spa-seat/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/examples/spa-seat/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
