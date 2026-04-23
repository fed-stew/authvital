# SDK Publishing Summary

This document provides a comprehensive overview of the AuthVital SDK publishing infrastructure, build pipeline, and release workflows.

---

## Table of Contents

1. [Package Overview](#1-package-overview)
2. [Build Pipeline](#2-build-pipeline)
3. [Publishing Workflow](#3-publishing-workflow)
4. [Package Dependencies](#4-package-dependencies)
5. [Publishing Steps](#5-publishing-steps)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Package Overview

### SDK Packages

The AuthVital monorepo contains 7 publishable packages with a structured dependency hierarchy:

| Package | NPM Name | Current Version | Purpose |
|---------|----------|-----------------|---------|
| **Contracts** | `@authvital/contracts` | `0.1.0` | Zod schemas and ts-rest API contracts for type-safe API communication |
| **Shared** | `@authvital/shared` | `0.1.0` | Shared types and constants used across all SDK packages |
| **SDK Core** | `@authvital/core` | `1.0.0` | Environment-agnostic authentication utilities, types, and OAuth logic |
| **SDK Browser** | `@authvital/browser` | `0.1.0` | Browser/SPA adapter with split-token architecture, in-memory storage, and silent refresh |
| **SDK Server** | `@authvital/server` | `0.1.0` | BFF/SSR adapter for Next.js, Express, and other server environments |
| **SDK React** | `@authvital/react` | `0.1.0` | React components, hooks, and provider for frontend integration |
| **SDK Node** | `@authvital/node` | `0.1.0` | Server-side SDK with API client, JWT validator, webhooks, and identity sync |

### Package Locations

```
packages/
├── contracts/          # @authvital/contracts
├── shared/             # @authvital/shared
├── sdk-core/           # @authvital/core
├── sdk-browser/        # @authvital/browser
├── sdk-server/         # @authvital/server
├── sdk-react/          # @authvital/react
└── sdk-node/           # @authvital/node
```

---

## 2. Build Pipeline

### Lefthook Pre-Push Configuration

The `lefthook.yml` at the repository root enforces a strict build order before any push:

```yaml
pre-push:
  jobs:
    - name: build contracts
      run: npm run build -w @authvital/contracts
      
    - name: build shared
      run: npm run build -w @authvital/shared

    - name: build sdk-core
      run: npm run build -w @authvital/core

    - name: build sdk-browser
      run: npm run build -w @authvital/browser

    - name: build sdk-server
      run: npm run build -w @authvital/server
      
    - name: build backend
      run: DATABASE_URL=postgresql://build:build@localhost:5432/build npm run prisma:generate -w @authvital/backend && npm run build -w @authvital/backend
      
    - name: build frontend
      run: npm run build -w @authvital/frontend
      
    - name: build sdk-node
      run: npm run build -w @authvital/node
      
    - name: build sdk-react
      run: npm run build -w @authvital/react
```

**Key Points:**
- Install lefthook: `npm install -g @evilmartians/lefthook`
- Run manually: `lefthook run pre-push`
- The build order respects dependency hierarchy (contracts → shared → core → dependents)

### CI Workflow Jobs

The `.github/workflows/ci.yml` runs parallel build verification for all SDK packages:

| Job | Purpose | Dependencies Built |
|-----|---------|-------------------|
| `sdk-core-build` | Build & typecheck Core SDK | contracts → shared → core |
| `sdk-browser-build` | Build & typecheck Browser SDK | contracts → shared → core → browser |
| `sdk-server-build` | Build & typecheck Server SDK | contracts → shared → core → server |
| `sdk-react-build` | Build & typecheck React SDK | contracts → shared → react |
| `sdk-node-build` | Build & typecheck Node SDK | contracts → shared → node |
| `backend-test` | Backend tests | contracts → shared → backend |
| `frontend-build` | Frontend build | contracts → shared → frontend |

**Build Order Requirements:**

```
contracts (foundation - no internal deps)
    ↓
shared (uses contracts)
    ↓
sdk-core (standalone - no internal deps)
    ↓
sdk-browser (uses shared, sdk-core)
sdk-server (uses shared, sdk-core)
sdk-react (uses shared)
sdk-node (uses shared)
backend (uses contracts, shared)
frontend (uses contracts, shared)
```

### Build Tooling

All SDK packages use **tsup** for building:

- **Entry Points**: Multiple entry points for subpath exports
- **Formats**: Both ESM (`esm`) and CommonJS (`cjs`)
- **Type Declarations**: `.d.ts` files generated for both formats
- **Source Maps**: Generated for debugging
- **Target**: ES2020 for broad compatibility

**Example tsup.config.ts (sdk-core):**
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'types/index': 'src/types/index.ts',
    'api/index': 'src/api/index.ts',
    'oauth/index': 'src/oauth/index.ts',
    'errors/index': 'src/errors/index.ts',
    'utils/index': 'src/utils/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  target: 'es2020',
  platform: 'neutral',
  outDir: 'dist',
});
```

---

## 3. Publishing Workflow

### GitHub Actions Workflow File

**Primary Workflow**: `.github/workflows/sdk-publish.yml`

This workflow handles publishing of all TypeScript/JavaScript SDKs to NPM.

### Triggers

| Trigger | Behavior |
|---------|----------|
| `push` to `main` branch | Publishes dev versions with `dev` tag |
| `push` of version tag (`v*`) | Publishes stable versions with `latest` tag |
| Changes to SDK paths | Only runs when SDK-related files change |
| `workflow_dispatch` | Manual trigger for emergency publishes |

**Path Filters:**
```yaml
paths:
  - 'packages/sdk-react/**'
  - 'packages/sdk-node/**'
  - 'packages/sdk-core/**'
  - 'packages/sdk-browser/**'
  - 'packages/sdk-server/**'
  - 'packages/shared/**'
```

### Version Strategies

#### Latest Versions (Release)

Triggered by: Git tags matching `v*`

**Version Format:** Extracted from tag (e.g., `v1.2.3` → version `1.2.3`)

**Tag Command:**
```bash
git tag -a v1.2.3 -m "Release version 1.2.3"
git push origin v1.2.3
```

**Publish Command:**
```bash
npm version $VERSION --no-git-tag-version --allow-same-version
npm publish --tag latest --access public
```

**Result:** Available as `@authvital/core@latest`

#### Dev Versions (Continuous)

Triggered by: Push to `main` branch

**Version Format:** `0.1.0-dev.{build_number}.{short_sha}`

**Example:** `0.1.0-dev.42.a3f2b1c`

**Publish Command:**
```bash
SHORT_SHA=$(echo ${{ github.sha }} | cut -c1-7)
BUILD_NUM=${{ github.run_number }}
npm version prerelease --preid="dev.${BUILD_NUM}.${SHORT_SHA}" --no-git-tag-version
npm publish --tag dev --access public
```

**Result:** Available as `@authvital/core@dev`

### NPM Authentication

Authentication uses the `NPM_TOKEN` secret stored in GitHub repository settings:

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'
    registry-url: 'https://registry.npmjs.org'

# ... build steps ...

- name: Publish
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
  run: npm publish --tag latest --access public
```

**Required Secret:**
- `NPM_TOKEN`: NPM access token with publish permissions for `@authvital` scope

### Job Dependencies

The workflow defines job dependencies to ensure proper publish order:

```
publish-core (no dependencies)
    ↓
publish-browser (needs: publish-core)
publish-server (needs: publish-core)
publish-react (needs: publish-core)
publish-node (needs: publish-core)
```

This ensures `@authvital/core` is always published first, as other SDKs depend on it.

### Cross-Platform SDK Publishing

Additional workflows publish to other package registries:

| Workflow | Registry | Package Type |
|----------|----------|--------------|
| `publish-all-sdks.yml` | PyPI, Crates.io, Maven, NuGet | Python, Rust, Java, .NET |
| `publish-crates.yml` | Crates.io | Rust only |
| `publish-maven.yml` | Maven Central | Java only |
| `publish-nuget.yml` | NuGet | .NET only |
| `publish-pypi.yml` | PyPI | Python only |

---

## 4. Package Dependencies

### Visual Dependency Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     FOUNDATION LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐                          │
│  │  contracts   │    │  sdk-core    │                          │
│  │   (0.1.0)    │    │   (1.0.0)    │                          │
│  │  Zod schemas │    │ OAuth, types │                          │
│  │  ts-rest     │    │ utilities    │                          │
│  └──────┬───────┘    └──────────────┘                          │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                                │
│  │    shared    │                                                │
│  │   (0.1.0)    │                                                │
│  │ Types, const │                                                │
│  └──────┬───────┘                                                │
└─────────┼─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SDK LAYER                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│   │ sdk-browser  │    │ sdk-server   │    │  sdk-react   │     │
│   │   (0.1.0)    │    │   (0.1.0)    │    │   (0.1.0)    │     │
│   │  Browser/SPA │    │  BFF/SSR     │    │  Components  │     │
│   │ Split-token  │    │ Middleware   │    │   Hooks      │     │
│   │  Auth client │    │  Sessions    │    │  Provider    │     │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘     │
│          │                   │                   │              │
│          │    ┌──────────────┴───────────────────┘              │
│          │    │                                                  │
│          │    ▼                                                  │
│          │  ┌──────────────┐                                      │
│          │  │  sdk-node    │                                      │
│          │  │   (0.1.0)    │                                      │
│          │  │ API client   │                                      │
│          │  │ JWT validator│                                      │
│          │  │  Webhooks    │                                      │
│          │  └──────────────┘                                      │
│          │                                                        │
│          └──────┬─────────────────────┬────────┘                  │
│                 │                     │                          │
│   Dependencies: │                     │                          │
│   • @authvital/core                 │                          │
│   • @authvital/shared               │                          │
│                 │                     │                          │
└─────────────────┼─────────────────────┼────────────────────────┘
                  │                     │
                  ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   APPLICATION LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐    ┌──────────────┐                          │
│   │   backend    │    │  frontend    │                          │
│   │  (private)   │    │  (private)   │                          │
│   │  NestJS API  │    │  React SPA   │                          │
│   └──────────────┘    └──────────────┘                          │
│                                                                  │
│   Dependencies: contracts, shared                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Dependency Table

| Package | Direct Dependencies | Build Order |
|---------|-------------------- |-------------|
| `contracts` | None (ts-rest, zod external) | 1st |
| `shared` | None | 2nd |
| `sdk-core` | None | 2nd |
| `sdk-browser` | `@authvital/core`, `@authvital/shared`, `axios` | 3rd |
| `sdk-server` | `@authvital/core`, `@authvital/shared`, `cookie` | 3rd |
| `sdk-react` | `@authvital/shared`, `react`, `react-dom` | 3rd |
| `sdk-node` | `@authvital/shared` | 3rd |

### Build Order Requirements

**Critical Rule**: Packages must be built in dependency order. A package cannot be built until all its dependencies have been built.

**Correct Build Sequence:**
```bash
# 1. Foundation (parallel safe)
npm run build -w @authvital/contracts
npm run build -w @authvital/shared
npm run build -w @authvital/core

# 2. Dependent SDKs (after foundation)
npm run build -w @authvital/browser
npm run build -w @authvital/server
npm run build -w @authvital/react
npm run build -w @authvital/node
```

---

## 5. Publishing Steps

### How to Publish a New Version

#### Option A: Automated Release (Recommended)

1. **Update version in package.json** (if not using tag extraction)
2. **Create and push a version tag:**
   ```bash
   git tag -a v1.2.3 -m "Release version 1.2.3"
   git push origin v1.2.3
   ```
3. **GitHub Actions automatically:**
   - Builds all SDKs in dependency order
   - Publishes to NPM with `latest` tag
   - Updates version from tag

#### Option B: Manual Release

1. **Ensure all tests pass:**
   ```bash
   npm test --workspaces
   ```

2. **Build all packages:**
   ```bash
   npm run build
   ```

3. **Login to NPM:**
   ```bash
   npm login
   ```

4. **Publish individual package:**
   ```bash
   cd packages/sdk-core
   npm version 1.2.3
   npm publish --tag latest --access public
   ```

### Tagging Strategy

| Tag Pattern | Purpose | Example |
|-------------|---------|---------|
| `v{major}.{minor}.{patch}` | Production release | `v1.2.3` |
| `v{major}.{minor}.{patch}-beta.{n}` | Beta pre-release | `v1.2.3-beta.1` |
| `v{major}.{minor}.{patch}-rc.{n}` | Release candidate | `v1.2.3-rc.1` |

**Semantic Versioning Rules:**
- **MAJOR**: Breaking changes
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes (backwards compatible)

### Prerelease Workflow

For beta or release candidate versions:

1. **Create prerelease tag:**
   ```bash
   git tag -a v1.2.3-beta.1 -m "Beta release 1.2.3-beta.1"
   git push origin v1.2.3-beta.1
   ```

2. **Users install with tag:**
   ```bash
   npm install @authvital/core@beta
   ```

### Version Checklist

Before publishing, verify:

- [ ] All tests pass
- [ ] All packages build successfully
- [ ] Version numbers are updated in package.json files
- [ ] CHANGELOG.md is updated
- [ ] Git tag follows naming convention (`v*.*.*`)
- [ ] NPM_TOKEN secret is configured in GitHub
- [ ] Documentation is updated if needed

---

## 6. Troubleshooting

### Common Issues

#### Issue: "Cannot find module" errors during build

**Cause**: Dependencies not built in correct order

**Solution:**
```bash
# Clean and rebuild in order
npm run clean
npm run build:contracts
npm run build:shared
npm run build:sdk-core
npm run build:sdk-browser  # or other SDKs
```

#### Issue: "EPUBLISHCONFLICT" - Version already exists

**Cause**: Attempting to publish a version that already exists on NPM

**Solution:**
- For dev builds: This is normal - each commit creates a unique version
- For releases: Ensure version is bumped before tagging

#### Issue: "ENEEDAUTH" - Authentication required

**Cause**: NPM_TOKEN not configured or expired

**Solution:**
1. Verify `NPM_TOKEN` secret in GitHub repository settings
2. Ensure token has publish permissions for `@authvital` scope
3. Check token hasn't expired

#### Issue: Lefthook builds failing

**Cause**: Missing database for backend build

**Solution:**
```bash
# Start PostgreSQL for build
docker run -d --name build-db \
  -e POSTGRES_USER=build \
  -e POSTGRES_PASSWORD=build \
  -e POSTGRES_DB=build \
  -p 5432:5432 postgres:15
```

#### Issue: TypeScript errors in CI but not locally

**Cause**: Different TypeScript versions or missing dependencies

**Solution:**
```bash
# Clean install
rm -rf node_modules packages/*/node_modules
npm install --legacy-peer-deps
npm run build
```

### How to Debug Failed Publishes

#### Step 1: Check GitHub Actions Logs

1. Navigate to **Actions** tab in GitHub repository
2. Find the failed workflow run
3. Expand the failed job to see detailed logs

#### Step 2: Reproduce Locally

```bash
# Match CI environment
npm install --legacy-peer-deps

# Build in dependency order
npm run build:contracts
npm run build:shared
npm run build:sdk-core

# Typecheck failing package
npm run typecheck -w @authvital/core

# Try build
npm run build -w @authvital/core
```

#### Step 3: Verify NPM Authentication

```bash
# Check login status
npm whoami

# View package permissions
npm access list packages @authvital/core
```

#### Step 4: Dry Run Publish

```bash
cd packages/sdk-core
npm publish --dry-run
```

#### Step 5: Emergency Manual Publish

If CI is broken but release is urgent:

```bash
# 1. Ensure clean build
npm run clean
npm run build

# 2. Login to NPM
npm login

# 3. Publish with explicit version
cd packages/sdk-core
npm version 1.2.3 --no-git-tag-version
npm publish --tag latest --access public
```

### Debugging Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run typecheck -w @authvital/core` | Check TypeScript errors |
| `npm pack -w @authvital/core` | Preview package contents |
| `npm publish --dry-run` | Simulate publish without uploading |
| `npm view @authvital/core` | View published package info |
| `npm view @authvital/core@dev` | View dev tag version |
| `npm outdated -w @authvital/core` | Check outdated dependencies |
| `npm ls -w @authvital/core` | List dependency tree |

### Getting Help

- **GitHub Issues**: https://github.com/intersparkio/authvital/issues
- **NPM Package Pages**: 
  - https://www.npmjs.com/package/@authvital/core
  - https://www.npmjs.com/package/@authvital/browser
  - https://www.npmjs.com/package/@authvital/server
  - https://www.npmjs.com/package/@authvital/react
  - https://www.npmjs.com/package/@authvital/node

---

## Appendix A: Quick Reference

### Root Build Commands

```bash
# Build everything
npm run build

# Build specific component
npm run build:contracts
npm run build:shared
npm run build:sdk-core
npm run build:sdk-browser
npm run build:sdk-server

# Clean everything
npm run clean
```

### Workspace Build Commands

```bash
# Build single package
npm run build -w @authvital/core

# Typecheck single package
npm run typecheck -w @authvital/core

# Lint single package
npm run lint -w @authvital/core
```

### NPM Tag Reference

| Tag | Install Command | Use Case |
|-----|-----------------|----------|
| `latest` | `npm install @authvital/core` | Production stable |
| `dev` | `npm install @authvital/core@dev` | Latest main branch |
| `beta` | `npm install @authvital/core@beta` | Beta testing |
| `next` | `npm install @authvital/core@next` | RC/next version |

---

*Document Version: 1.0.0*  
*Last Updated: 2024*
