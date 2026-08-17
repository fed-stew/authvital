# Middleware

> Express, Next.js, and NestJS integration.

!!! warning "No `createJwtMiddleware` / `createPassportJwtOptions`"
    Earlier drafts documented `createJwtMiddleware()` and a Passport.js helper
    `createPassportJwtOptions()`. **Neither exists.** The real middleware is
    session-cookie based: `authVitalMiddleware` (Express), `createAuthMiddleware`
    + server helpers (Next.js), and `AuthVitalModule` + guards (NestJS). For raw
    JWT verification (e.g. a Passport strategy) use
    [`verifyToken` / `JWKSClient`](./jwt-validation.md) directly.

## Express

Import from `@authvital/server` (or the `@authvital/server/middleware/express`
subpath).

### authVitalMiddleware

Parses the encrypted session cookie, refreshes expired tokens, and attaches an
`AuthVitalContext` to `req.authVital` (including a pre-configured `ServerClient`).

```typescript
import express from 'express';
import { authVitalMiddleware, requireAuth, requirePermission } from '@authvital/server';

const app = express();

app.use(authVitalMiddleware({
  secret: process.env.SESSION_SECRET!,   // 32+ chars (cookie encryption)
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
  publicRoutes: ['/login', '/api/public', /^\/assets\//],
}));
```

`req.authVital` (`AuthVitalContext`):

```typescript
interface AuthVitalContext {
  accessToken: string;
  refreshToken: string | null;
  sessionId: string;
  client: ServerClient;   // pre-configured with the access token
  refreshed: boolean;     // was the session refreshed this request?
  metadata: { createdAt: number; lastAccessedAt: number; rotationCount: number };
}
```

### requireAuth()

Guard that rejects requests without a valid session (401, or redirect).

```typescript
app.get('/api/profile', requireAuth(), async (req, res) => {
  const user = await req.authVital!.client.getCurrentUser();
  res.json({ user });
});

// Redirect instead of 401:
app.get('/dashboard', requireAuth({ redirectTo: '/login' }), handler);
```

### requirePermission()

Guard that checks permissions by calling AuthVital's `/api/auth/check-permissions`
with the session's client. It succeeds only when **all** listed permissions are
allowed (`allAllowed`).

```typescript
app.delete('/api/users/:id',
  requireAuth(),
  requirePermission('users:delete'),
  async (req, res) => { /* ... */ }
);
```

### Session handlers

```typescript
import { setSession, clearSession, createSessionStore } from '@authvital/server';

const sessionStore = createSessionStore({
  secret: process.env.SESSION_SECRET!,
  authVitalHost: process.env.AV_HOST!,
});

app.post('/api/login', async (req, res) => {
  const tokens = await authenticateUser(req.body);
  setSession(sessionStore, tokens, req, res);
  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  clearSession(sessionStore, req, res);
  res.json({ success: true });
});
```

## Next.js

Import from `@authvital/server/middleware/nextjs`.

| Export | Use |
|--------|-----|
| `createAuthMiddleware(config)` | Edge middleware (`middleware.ts`) |
| `requireServerAuth(cookies, config, opts)` | Server Component — redirect if unauthenticated |
| `getServerAuth(cookies, config)` | Server Component — soft check |
| `getServerSideAuth(context, config)` | Pages Router `getServerSideProps` |
| `getRouteAuth(request, config)` | App Router Route Handler |
| `setRouteSession` / `clearRouteSession` | Set/clear the session cookie in Route Handlers |

```typescript
// middleware.ts
import { createAuthMiddleware } from '@authvital/server/middleware/nextjs';

export default createAuthMiddleware({
  secret: process.env.SESSION_SECRET!,
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
  publicPaths: ['/login', '/signup'],
  loginPath: '/login',
});

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

```typescript
// app/dashboard/page.tsx
import { requireServerAuth } from '@authvital/server/middleware/nextjs';
import { cookies } from 'next/headers';

export default async function DashboardPage() {
  const auth = await requireServerAuth(cookies(), {
    secret: process.env.SESSION_SECRET!,
    authVitalHost: process.env.AV_HOST!,
    clientId: process.env.AV_CLIENT_ID!,
    clientSecret: process.env.AV_CLIENT_SECRET!,
  }, { loginPath: '/login' });

  const user = await auth.client.getCurrentUser();
  return <div>Welcome, {user?.email}</div>;
}
```

## NestJS

Import from `@authvital/server/middleware/nestjs`.

| Export | Use |
|--------|-----|
| `AuthVitalModule` | Register the SDK (provides session store + config) |
| `AuthVitalGuard` | Session-based auth guard |
| `AuthVitalJwtGuard` | JWT/JWKS-based auth guard |
| `AuthVitalPermissionGuard` | Permission guard (pairs with `@RequirePermissions`) |
| `@CurrentUser()` / `@Public()` / `@RequirePermissions()` | Decorators |

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  AuthVitalJwtGuard,
  AuthVitalPermissionGuard,
  CurrentUser,
  RequirePermissions,
} from '@authvital/server/middleware/nestjs';

@Controller('projects')
@UseGuards(AuthVitalJwtGuard)
export class ProjectsController {
  @Get()
  list(@CurrentUser() user: any) {
    return { user };
  }

  @Get('admin')
  @UseGuards(AuthVitalPermissionGuard)
  @RequirePermissions('projects:admin')
  admin() {
    return { ok: true };
  }
}
```

## Building your own JWT guard

If you want a stateless JWT check (no session cookie), compose it from
`verifyToken`:

```typescript
import { verifyToken } from '@authvital/server';

function requireJwt() {
  return async (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const result = await verifyToken(token ?? '', {
      jwksUri: `${process.env.AV_HOST}/.well-known/jwks.json`,
      audience: process.env.AV_CLIENT_ID,
      issuer: process.env.AV_HOST,
    });
    if (!result.valid) return res.status(401).json({ error: result.error });
    (req as any).claims = result.payload;
    next();
  };
}
```
