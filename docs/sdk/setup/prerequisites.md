# Prerequisites & Overview

> Understand requirements and architecture before integrating AuthVital.

---

## Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | 18.0+ | Required for ES modules and native fetch |
| **AuthVital Application** | - | You need a `clientId` and `clientSecret` from the AuthVital dashboard |
| **Database** | PostgreSQL recommended | For identity sync; other Prisma-supported databases work too |
| **Package Manager** | npm, yarn, or pnpm | Any works fine |

---

## Getting Your Credentials

1. Log into your AuthVital dashboard
2. Navigate to **Applications** → **Create Application** (or select existing)
3. Note your:
   - **Client ID**: `av_app_xxxxxxxx`
   - **Client Secret**: `av_secret_xxxxxxxx`
   - **AuthVital Host**: `https://auth.yourcompany.com` (or your custom domain)
4. Set up **Redirect URIs** for OAuth callbacks:
   - Development: `http://localhost:3000/api/auth/callback`
   - Production: `https://yourapp.com/api/auth/callback`

---

## Installation

!!! warning "Package names"
    There is no single `@authvital/sdk` package. AuthVital ships **two** SDK
    packages: `@authvital/browser` (with React entry `@authvital/browser/react`)
    and `@authvital/server` (plus the shared `@authvital/core` /
    `@authvital/shared`). `createAuthVital`, `WebhookRouter`, and
    `IdentitySyncHandler` **do not exist** — see notes below.

Browser / React app:

```bash
npm install @authvital/browser
```

Server / BFF app:

```bash
npm install @authvital/server @authvital/core
```

Real imports:

```typescript
// Server-side (Node.js backend)
import { createServerClient, OAuthFlow, verifyToken } from '@authvital/server';

// Client-side (React frontend)
import { AuthVitalProvider, useAuth } from '@authvital/browser/react';
```

---

## Environment Variables

Create a `.env` file with your AuthVital credentials:

```bash
# .env

# AuthVital Configuration
AV_HOST=https://auth.yourapp.com
AV_CLIENT_ID=av_app_xxxxxxxxxxxxxxxx
AV_CLIENT_SECRET=av_secret_xxxxxxxxxxxxxxxx

# OAuth Redirect URI (must match AuthVital dashboard)
OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Database (for identity sync)
DATABASE_URL=postgresql://user:password@localhost:5432/myapp?schema=public

# Session secret (for storing OAuth state)
SESSION_SECRET=your-super-secret-key-at-least-32-chars
```

!!! warning "Security"
    Never commit `.env` files to git! Add `.env` to your `.gitignore`.

---

## SDK Configuration

!!! warning "No `createAuthVital()` factory"
    The real server entry point is `createServerClient()`, which returns a
    `ServerClient` (with `.integration.*` for M2M calls). See the
    [Server SDK](../server-sdk/index.md) reference.

Create a centralized server client instance:

```typescript
// lib/authvital.ts
import { createServerClient } from '@authvital/server';

if (!process.env.AV_HOST) throw new Error('AV_HOST is required');
if (!process.env.AV_CLIENT_ID) throw new Error('AV_CLIENT_ID is required');
if (!process.env.AV_CLIENT_SECRET) throw new Error('AV_CLIENT_SECRET is required');

export const authvital = createServerClient({
  authVitalHost: process.env.AV_HOST,
  clientId: process.env.AV_CLIENT_ID,
  clientSecret: process.env.AV_CLIENT_SECRET,
});
```

**What this actually gives you** (verified against
`packages/sdk-server/src/client`):

| Member | Purpose |
|--------|---------|
| `authvital.integration` | M2M (client-credentials) API: `listTenantMembers`, `checkPermission`, `getUserLicenses`, `sendInvitation`, `setMemberRole`, … Takes explicit params like `{ tenantId }`, **not** an Express `req`. See [Memberships](../server-sdk/namespaces/memberships.md). |
| `authvital.getClientCredentialsToken()` | Fetch/cache an M2M access token. |
| `authvital.introspectToken(token?)` / `authvital.revokeToken(...)` | Token introspection / revocation. |
| `authvital.getCurrentUser()` | `GET /api/users/me` for the client's **own stored** access token — takes **no** `req`, returns `User \| null`. Requires user tokens via `setTokens(...)`. |
| `authvital.getTenantMemberships()` / `authvital.hasPermission(perm)` | Convenience calls for the client's stored-token user. |
| `authvital.get/post/put/patch/delete(...)` | Low-level authenticated requests to arbitrary paths. |
| `authvital.setTokens(...)` / `getTokens()` / `isAuthenticated()` | Manage the tokens the client sends. |

!!! warning "These are NOT on the client"
    There is **no** `authvital.getCurrentUser(req)` returning
    `{ authenticated, user, error }`, **no** `authvital.validateRequest(req)`, and
    **no** fluent `authvital.memberships.*` / `.invitations.*` / `.permissions.*`
    / `.licenses.*` / `.sessions.*` namespaces. Request/JWT validation is done
    with the standalone `verifyToken()` / `decodeToken()` functions (see
    [JWT Validation](../server-sdk/jwt-validation.md)); session cookies are
    handled by `SessionStore` / `authVitalMiddleware`.

---

## Next Steps

- [Backend Setup](./backend.md) - Set up OAuth routes for Express or Next.js
