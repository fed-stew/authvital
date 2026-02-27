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

Install the AuthVital SDK in your project:

```bash
# npm
npm install @authvital/sdk

# yarn
yarn add @authvital/sdk

# pnpm
pnpm add @authvital/sdk
```

The SDK includes both **server** and **client** modules:

```typescript
// Server-side (Node.js backend)
import { createAuthVital, OAuthFlow } from '@authvital/sdk/server';
import { WebhookRouter, IdentitySyncHandler } from '@authvital/sdk/server';

// Client-side (React frontend)
import { AuthVitalProvider, useAuth } from '@authvital/sdk/client';
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

Create a centralized AuthVital client instance:

```typescript
// lib/authvital.ts
import { createAuthVital } from '@authvital/sdk/server';

if (!process.env.AV_HOST) throw new Error('AV_HOST is required');
if (!process.env.AV_CLIENT_ID) throw new Error('AV_CLIENT_ID is required');
if (!process.env.AV_CLIENT_SECRET) throw new Error('AV_CLIENT_SECRET is required');

export const authvital = createAuthVital({
  authVitalHost: process.env.AV_HOST,
  clientId: process.env.AV_CLIENT_ID,
  clientSecret: process.env.AV_CLIENT_SECRET,
});
```

**What this gives you:**

| Method | Purpose |
|--------|--------|
| `authvital.getCurrentUser(req)` | Soft validation - returns `{ authenticated, user, error }` |
| `authvital.validateRequest(req)` | Strict validation - throws if not authenticated |
| `authvital.memberships.*` | Tenant membership operations |
| `authvital.invitations.*` | Invitation management |
| `authvital.permissions.*` | Permission checks |
| `authvital.licenses.*` | License operations |
| `authvital.sessions.*` | Session management |

---

## Next Steps

- [Backend Setup](./backend.md) - Set up OAuth routes for Express or Next.js
