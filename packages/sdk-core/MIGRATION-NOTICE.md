# Package Migration Notice ⚠️

> **Important:** The old AuthVital packages have been **removed** and replaced with a new modular architecture.

## 🗑️ Removed Packages

The following packages are **no longer available** and have been replaced:

| Old Package | Replacement Package |
|-------------|---------------------|
| `@authvital/node` | `@authvital/server` |
| `@authvital/react` | `@authvital/browser` |

> **Note:** Installing the old packages will fail. You must migrate to the new packages.

---

## 🚀 Migration Path

### For Server/Node.js Applications
**Migrate to:** `@authvital/server`

```bash
npm uninstall @authvital/node
npm install @authvital/server
```

The server package is designed for:
- Node.js backends
- API servers
- Server-side authentication flows
- Server Actions (Next.js App Router)

### For React/SPA Applications
**Migrate to:** `@authvital/browser`

```bash
npm uninstall @authvital/react
npm install @authvital/browser
```

The browser package is designed for:
- React applications
- Single Page Applications (SPAs)
- Client-side authentication
- Browser-based OAuth flows

### For Custom Implementations
**Use:** `@authvital/core`

```bash
npm install @authvital/core
```

The core package provides:
- Base types and interfaces
- Platform-agnostic utilities
- Foundation for custom SDK implementations

---

## 💥 Breaking Changes

### 1. Package Deprecation
- **Old packages no longer exist in the npm registry**
- Attempting to install `@authvital/node` or `@authvital/react` will fail

### 2. New Split-Token Architecture
The new packages implement a split-token authentication system:
- **Public Token** (`vt_`) - Client-side safe, limited capabilities
- **Secret Token** (`st_`) - Server-side only, full capabilities

This separation provides:
- Better security by design
- Clearer separation of concerns
- Reduced risk of token leakage

### 3. API Changes
- New initialization methods
- Different authentication flows
- Updated method signatures
- Changed import paths

---

## 📋 Quick Migration Guide

### Step 1: Uninstall Old Package
```bash
# For Node.js/server applications
npm uninstall @authvital/node

# For React/browser applications
npm uninstall @authvital/react
```

### Step 2: Install New Package
```bash
# For Node.js/server applications
npm install @authvital/server

# For React/browser applications
npm install @authvital/browser
```

### Step 3: Update Imports
```typescript
// Before (Node.js)
import { AuthVital } from '@authvital/node';

// After
import { AuthVital } from '@authvital/server';
```

```typescript
// Before (React)
import { useAuthVital } from '@authvital/react';

// After
import { AuthVital } from '@authvital/browser';
```

### Step 4: Update Code
Review and update your implementation code to match the new API. Key changes include:
- Initialization parameters
- Token handling
- Authentication methods

---

## 📖 Full Migration Documentation

For a complete migration guide including:
- Detailed API changes
- Code examples
- Migration scripts
- Common issues and solutions

**See:** [MIGRATION.md](./MIGRATION.md)

---

## 🆘 Support

### GitHub Issues
Encountering problems during migration?

📎 **[Submit an Issue](https://github.com/authvital/authvital-js/issues)**

Include:
- Your current package versions
- Target package versions
- Error messages
- Relevant code snippets

### Common Issues
- **Import errors:** Double-check package names
- **Token errors:** Verify you're using the correct token type
- **Build errors:** Ensure all dependencies are updated

---

## ⚡ Migration Checklist

- [ ] Uninstall old packages (`@authvital/node` or `@authvital/react`)
- [ ] Install new packages (`@authvital/server` or `@authvital/browser`)
- [ ] Update all import statements
- [ ] Update initialization code
- [ ] Update token handling
- [ ] Test authentication flows
- [ ] Update CI/CD pipelines
- [ ] Update documentation

---

**Need help?** Refer to the full [MIGRATION.md](./MIGRATION.md) guide or [open an issue](https://github.com/authvital/authvital-js/issues).
