# Server SDK

> Framework-agnostic server SDK (`@authvital/server`) for BFF/SSR apps.

The Server SDK provides encrypted session cookies, a server-side API client with
automatic token refresh, an OAuth PKCE flow helper, JWT/JWKS verification
utilities, and framework middleware for Express, Next.js, and NestJS.

## Installation

```bash
npm install @authvital/server @authvital/core
```

## The three building blocks

There is **no** `createAuthVital()` "god object" and there are **no** fluent
`authvital.tenants.*` / `authvital.users.*` namespaces. The real surface is three
factories plus verification utilities:

| Import | What it is |
|--------|------------|
| `createServerClient(config, tokens?)` | A `ServerClient` for authenticated + M2M API calls. Exposes `.integration.*` for server-to-server operations. |
| `createSessionStore(config)` | Encrypted (AES-256-GCM) httpOnly session cookie management. |
| `OAuthFlow` | Server-side OAuth 2.0 **PKCE** flow (`startFlow` / `handleCallback` / `refreshTokens`). |

Plus JWT verification utilities re-exported from `@authvital/core`:
`verifyToken`, `decodeToken`, `JWKSClient`.

```typescript
import {
  createServerClient,
  createSessionStore,
  OAuthFlow,
  verifyToken,
  decodeToken,
} from '@authvital/server';
```

## Subpath entry points

The package declares these export subpaths (see `package.json` `exports`):

| Subpath | Contents |
|---------|----------|
| `@authvital/server` | Everything below, re-exported from the root |
| `@authvital/server/session` | `createSessionStore`, `SessionStore`, cookie utilities |
| `@authvital/server/client` | `createServerClient`, `ServerClient`, `IntegrationClient`, types |
| `@authvital/server/crypto` | `encrypt`/`decrypt`, `verifyToken`, `decodeToken`, `JWKSClient` |
| `@authvital/server/middleware/express` | `authVitalMiddleware`, `requireAuth`, `requirePermission` |
| `@authvital/server/middleware/nextjs` | `createAuthMiddleware`, `requireServerAuth`, `getServerAuth`, `getServerSideAuth`, `getRouteAuth`, ... |
| `@authvital/server/middleware/nestjs` | `AuthVitalModule`, `AuthVitalGuard`, `AuthVitalJwtGuard`, decorators |

!!! note "OAuth PKCE lives on the root export"
    `OAuthFlow` is exported from the package root (`@authvital/server`); there is
    no `@authvital/server/oauth` subpath.

## Quick setup

### Express (session middleware)

```typescript
import express from 'express';
import { authVitalMiddleware, requireAuth } from '@authvital/server/middleware/express';

const app = express();

app.use(authVitalMiddleware({
  secret: process.env.SESSION_SECRET!,   // 32+ chars
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
  publicRoutes: ['/login', '/api/public'],
}));

app.get('/api/profile', requireAuth(), async (req, res) => {
  // A ServerClient, pre-configured with the session's access token
  const user = await req.authVital!.client.getCurrentUser();
  res.json({ user });
});
```

### Direct API client

```typescript
import { createServerClient } from '@authvital/server';

const client = createServerClient({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
}, {
  accessToken: session.accessToken,
  refreshToken: session.refreshToken,
  expiresAt: session.expiresAt,
  sessionId: session.id,
});

const user = await client.getCurrentUser();          // GET /api/users/me
const members = await client.getTenantMemberships(); // GET /api/tenants/memberships
```

## Configuration (`ServerClientConfig`)

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `authVitalHost` | `string` | Yes | AuthVital server URL |
| `clientId` | `string` | Yes | OAuth client ID |
| `clientSecret` | `string` | Yes | OAuth client secret (refresh + M2M) |
| `timeout` | `number` | No | Request timeout in ms (default `30000`) |

## Documentation Structure

<div class="grid cards" markdown>

-   :material-shield-check:{ .lg .middle } **[JWT Validation](./jwt-validation.md)**

    ---

    Verify tokens with `verifyToken` / `JWKSClient` and read claims.

-   :material-api:{ .lg .middle } **[Integration API](./namespaces/overview.md)**

    ---

    The `client.integration.*` server-to-server methods (M2M).

-   :material-lock:{ .lg .middle } **[OAuth Flow](./oauth-flow.md)**

    ---

    The `OAuthFlow` PKCE helper: `startFlow`, `handleCallback`, `refreshTokens`.

-   :material-middleware:{ .lg .middle } **[Middleware](./middleware.md)**

    ---

    Express, Next.js, and NestJS integration.

</div>

## Environment Variables

```bash
AV_HOST=https://auth.yourapp.com
AV_CLIENT_ID=your-client-id
AV_CLIENT_SECRET=your-client-secret
SESSION_SECRET=at-least-32-characters-of-random-secret
```
