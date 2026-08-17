# Quick Start Guide

> Get AuthVital integrated into your application. Uses the real packages:
> **`@authvital/server`** (Node/Express) and **`@authvital/browser`** (SPA/React).

!!! info "There is no `@authvital/sdk` / `createAuthVital`"
    Earlier drafts imported `createAuthVital` from `@authvital/sdk/server` and a
    `ProtectedRoute` component from `@authvital/sdk/client`. Those don't exist.
    The real entry points are `createServerClient` / `authVitalMiddleware` from
    `@authvital/server` and `AuthVitalProvider` / `useAuth` from
    `@authvital/browser/react`.

## Prerequisites

- Node.js 18+
- A running AuthVital instance (see [Installation](./installation.md))
- An OAuth application created in the AuthVital Admin Panel

## Step 1: Install

```bash
# Server (Node/Express/NestJS)
npm install @authvital/server

# Browser (SPA / React)
npm install @authvital/browser
```

## Step 2: Credentials

From the Admin Panel, create an application and note:

| Credential | Example | Where |
|------------|---------|-------|
| `AV_HOST` | `https://auth.yourcompany.com` | Your AuthVital URL |
| `CLIENT_ID` | `a1b2c3d4-...` | Application → Settings |
| `CLIENT_SECRET` | `secret_xyz...` | Application → Settings (server only) |

## Step 3: Server-side (Express)

The server SDK uses a **session-cookie (BFF) model**: `authVitalMiddleware`
parses/refreshes the session and attaches `req.authVital` (which includes a
pre-configured `client`).

```typescript
// app.ts
import express from 'express';
import cookieParser from 'cookie-parser';
import { authVitalMiddleware, requireAuth, verifyToken } from '@authvital/server';

const app = express();
app.use(cookieParser());
app.use(express.json());

app.use(
  authVitalMiddleware({
    authVitalHost: process.env.AV_HOST!,
    clientId: process.env.AV_CLIENT_ID!,
    clientSecret: process.env.AV_CLIENT_SECRET!,
    secret: process.env.SESSION_SECRET!, // encrypts the session cookie (>= 32 chars)
    publicRoutes: ['/health'],
  }),
);

// Public
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Protected — requireAuth() ensures req.authVital exists.
// Read the user straight from the verified token (fast, no network call).
app.get('/api/me', requireAuth(), async (req, res) => {
  const claims = await verifyToken(req.authVital!.accessToken, {
    authVitalHost: process.env.AV_HOST!,
  });
  res.json({
    sub: claims.sub,
    email: claims.email,
    tenantId: claims.tenant_id,
    roles: claims.tenant_roles,
    permissions: claims.tenant_permissions,
  });
});

app.listen(3001, () => console.log('API on :3001'));
```

### Checking permissions

Prefer reading the `tenant_permissions` claim from the verified token, or use the
M2M integration API for authoritative checks:

```typescript
app.post('/api/admin/users', requireAuth(), async (req, res) => {
  const payload = await verifyToken(req.authVital!.accessToken, {
    authVitalHost: process.env.AV_HOST!,
  });
  if (!payload.tenant_permissions?.includes('users:write')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // ...handle
});
```

!!! warning "Some `ServerClient` convenience methods are broken"
    `client.getCurrentUser()`, `client.getTenantMemberships()`, and
    `client.hasPermission()` currently call backend routes that don't exist
    (`/api/users/me`, `/api/tenants/memberships`, `/api/auth/check-permission`).
    Prefer reading claims from `verifyToken`, or the real REST endpoints
    (`GET /api/auth/me`, `GET /oauth/tenants`) and the M2M
    `client.integration.*` methods. The `requirePermission(...)` middleware has a
    related issue — see
    [Permissions](../sdk/server-sdk/namespaces/permissions.md).

## Step 4: Client-side (React)

React helpers live under the **`/react`** subpath of `@authvital/browser`.

```tsx
// main.tsx
import { AuthVitalProvider } from '@authvital/browser/react';

<AuthVitalProvider
  authVitalHost={import.meta.env.VITE_AV_HOST}
  clientId={import.meta.env.VITE_AV_CLIENT_ID}
>
  <App />
</AuthVitalProvider>;
```

```tsx
// App.tsx
import { useAuth } from '@authvital/browser/react';

export function App() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();

  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return <button onClick={() => login()}>Sign In</button>;

  return (
    <div>
      <h1>Welcome, {user?.given_name}!</h1>
      <p>{user?.email}</p>
      <button onClick={() => logout()}>Sign Out</button>
    </div>
  );
}
```

### Protecting a route / checking permissions

Use the **hooks** `useProtectedRoute` and `usePermissions` (there is no
`ProtectedRoute` component):

```tsx
import { useProtectedRoute, usePermissions } from '@authvital/browser/react';

function AdminPage() {
  const { isChecking, isAllowed } = useProtectedRoute({
    redirectTo: '/login',
    requiredRoles: ['admin'], // roles, not permissions
  });
  const { hasPermission } = usePermissions();

  if (isChecking) return <div>Checking…</div>;
  if (!isAllowed || !hasPermission('admin:access')) return <div>Access denied</div>;
  return <AdminPanel />;
}
```

### Non-React usage

```ts
import { AuthVitalClient } from '@authvital/browser';

const auth = new AuthVitalClient({
  authVitalHost: import.meta.env.VITE_AV_HOST,
  clientId: import.meta.env.VITE_AV_CLIENT_ID,
});

// On your OAuth callback route:
const result = await auth.handleCallback();
if (result.success) console.log('Logged in as', result.user?.email);

// Authenticated requests (auto-refresh + interceptors):
const api = auth.getAxiosInstance();
const { data } = await api.get('/api/protected');
```

## Step 5: Environment variables

```bash
# Server
AV_HOST=https://auth.yourcompany.com
AV_CLIENT_ID=your-client-id
AV_CLIENT_SECRET=your-client-secret
SESSION_SECRET=a-long-random-string

# Client (never expose the secret!)
VITE_AV_HOST=https://auth.yourcompany.com
VITE_AV_CLIENT_ID=your-client-id
```

## What's next?

| Topic | Link |
|-------|------|
| OAuth flow details | [OAuth 2.0 / OIDC Flows](../concepts/oauth-flow.md) |
| Server OAuth helper | [Server SDK: OAuth Flow](../sdk/server-sdk/oauth-flow.md) |
| Sync users to your DB | [Identity Sync](../sdk/identity-sync/index.md) |
| Real-time events | [Webhooks](../sdk/webhooks.md) |
| Permissions & licenses | [Server SDK](../sdk/server-sdk/index.md) |

## Troubleshooting

- **Invalid redirect URI** — register it under your application's settings.
- **CORS error** — add your frontend origin to Allowed Web Origins.
- **Token validation failed** — check `AV_HOST` matches exactly, credentials are
  correct, and the JWT hasn't expired.

---

*Need help? Check the [documentation index](../README.md).*
