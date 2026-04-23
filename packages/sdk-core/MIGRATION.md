# SDK Migration Guide: Old SDK → Core + Adapters Architecture

This guide helps you migrate from the legacy `@authvital/react` and `@authvital/node` SDKs to the new **Core + Adapters** architecture.

---

## Table of Contents

1. [Overview](#overview)
2. [Package Selection Guide](#package-selection-guide)
3. [Breaking Changes](#breaking-changes)
4. [Migration from @authvital/react](#migration-from-authvitalreact)
5. [Migration from @authvital/node](#migration-from-authvitalnode)
6. [Backend Compatibility](#backend-compatibility)
7. [Security Improvements](#security-improvements)
8. [Quick Start Examples](#quick-start-examples)

---

## Overview

### New Architecture: Core + Adapters

The new SDK architecture consists of three packages:

```
┌─────────────────────────────────────────────────────────────┐
│                    @authvital/core                         │
│         (Environment-agnostic: types, OAuth, utils)         │
└─────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
┌─────────────────────────┐      ┌─────────────────────────┐
│   @authvital/browser    │      │    @authvital/server    │
│                         │      │                         │
│  • In-memory tokens     │      │  • Encrypted cookies      │
│  • Silent refresh       │      │  • Session management     │
│  • Axios interceptors     │      │  • BFF pattern            │
│  • React hooks            │      │  • Next.js/Express      │
│                         │      │                         │
│  For: SPAs, React apps  │      │  For: Next.js, Express    │
└─────────────────────────┘      └─────────────────────────┘
```

### Why Migrate?

| Aspect | Old SDK | New SDK |
|--------|---------|---------|
| **Token Storage** | localStorage / memory | In-memory (browser) / encrypted cookies (server) |
| **Security** | XSS vulnerable | XSS protected, CSRF protected |
| **Architecture** | Monolithic | Modular, environment-specific |
| **SSR Support** | Limited | First-class Next.js/Express support |
| **Bundle Size** | Larger | Tree-shakeable, smaller bundles |
| **Backend Auth** | Cookie-based token extraction | Strict `Authorization: Bearer` header |

---

## Package Selection Guide

Choose the right package based on your application architecture:

### When to use `@authvital/browser` (SPAs)

**Use for:**
- Single Page Applications (React, Vue, Angular, Svelte)
- Client-side rendered apps
- Mobile web apps
- Any app where tokens live entirely in the browser

```bash
npm install @authvital/browser
```

**Key features:**
- In-memory access token storage (no localStorage!)
- Silent token refresh with httpOnly refresh cookies
- Axios instance with automatic auth headers
- React hooks (optional peer dependency)

### When to use `@authvital/server` (Next.js, Express, SSR)

**Use for:**
- Next.js (App Router or Pages Router)
- Express.js backends
- Server-side rendered applications
- Backend-for-Frontend (BFF) patterns

```bash
npm install @authvital/server
```

**Key features:**
- Encrypted session cookies
- Automatic session rotation
- Server-side token refresh
- Express/Next.js middleware

### When to use `@authvital/core` (Custom Implementations)

**Use for:**
- Building custom SDK adapters
- Framework-specific implementations
- Library authors
- Direct API integration

```bash
npm install @authvital/core
```

**Key features:**
- Pure TypeScript (no dependencies)
- OAuth flow utilities (PKCE, URL builders)
- Type definitions
- API endpoint definitions
- Error classes

---

## Breaking Changes

### ⚠️ Critical Changes

#### 1. No More Cookie-Based Token Extraction in Backend

**Old behavior:**
```javascript
// Old backend tried to extract tokens from cookies automatically
const token = req.cookies['access_token']; // ❌ No longer works
```

**New behavior:**
```javascript
// Backend ONLY accepts Authorization: Bearer header
const authHeader = req.headers['authorization']; // ✅ Required
const token = authHeader?.replace('Bearer ', '');
```

#### 2. Access Token Storage Changes

| Environment | Old SDK | New SDK |
|-------------|---------|---------|
| **Browser** | localStorage or memory | **In-memory only** (no localStorage) |
| **Server** | Session storage | **Encrypted cookies** |

**Migration impact:** Your app must not rely on localStorage for tokens. Use the SDK's in-memory store.

#### 3. Backend Strictly Requires `Authorization: Bearer` Header

**Old SDK:**
```javascript
// Backend would look for tokens in multiple places
app.get('/api/data', (req, res) => {
  // Would check: cookies, headers, query params
  const user = await authvital.getCurrentUser(req); // Flexible
});
```

**New SDK:**
```javascript
// Backend ONLY accepts Authorization header
app.get('/api/data', 
  requireAuth(), // Checks Authorization: Bearer header
  (req, res) => {
    // req.authVital.accessToken is guaranteed to exist
  }
);
```

---

## Migration from @authvital/react

### Before (Old SDK)

```tsx
// App.tsx - Old @authvital/react
import { AuthVitalProvider, useAuth } from '@authvital/react';

function App() {
  return (
    <AuthVitalProvider
      clientId="my-client-id"
      authVitalHost="https://auth.myapp.com"
      initialUser={serverUser}  // Required initial user from server
    >
      <YourApp />
    </AuthVitalProvider>
  );
}

// Component.tsx
function Profile() {
  const { user, isAuthenticated, login, signOut, refreshToken } = useAuth();
  
  if (!isAuthenticated) {
    return <button onClick={() => login()}>Sign In</button>;
  }
  
  return (
    <div>
      <p>Hello, {user?.email}</p>
      <button onClick={() => signOut()}>Sign Out</button>
    </div>
  );
}
```

### After (New @authvital/browser)

```tsx
// App.tsx - New @authvital/browser
import { AuthVitalProvider, useAuth } from '@authvital/browser/react';

function App() {
  return (
    <AuthVitalProvider
      clientId="my-client-id"
      authVitalHost="https://auth.myapp.com"
      redirectUri={`${window.location.origin}/auth/callback`}
      onAuthRequired={() => window.location.href = '/login'}
    >
      <YourApp />
    </AuthVitalProvider>
  );
}

// Component.tsx
function Profile() {
  const { user, isAuthenticated, login, logout, refreshToken } = useAuth();
  const api = useApi(); // Axios instance with auth headers
  
  if (!isAuthenticated) {
    return <button onClick={() => login()}>Sign In</button>;
  }
  
  return (
    <div>
      <p>Hello, {user?.email}</p>
      <button onClick={() => logout()}>Sign Out</button>
    </div>
  );
}
```

### Token Storage Changes

**Old approach (localStorage/sessionStorage):**
```typescript
// ❌ Old SDK stored tokens in localStorage
localStorage.setItem('access_token', token);
const token = localStorage.getItem('access_token');
```

**New approach (in-memory):**
```typescript
// ✅ New SDK uses in-memory storage
import { AuthVitalClient } from '@authvital/browser';

const client = new AuthVitalClient({
  authVitalHost: 'https://auth.myapp.com',
  clientId: 'my-client-id',
});

// Token is automatically managed in memory
const token = client.getAccessToken(); // Returns current token or null

// Silent refresh happens automatically
const isAuth = await client.checkAuth(); // Refreshes if needed
```

### API Client Setup

**Old SDK:**
```typescript
// ❌ Had to manually attach tokens
const response = await fetch('/api/data', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
});
```

**New SDK:**
```typescript
// ✅ Automatic via Axios interceptors
import { useApi } from '@authvital/browser/react';

function DataFetcher() {
  const api = useApi(); // Pre-configured Axios instance
  
  useEffect(() => {
    // Token is automatically attached
    api.get('/api/data')
      .then(response => setData(response.data));
  }, [api]);
}
```

**Manual fetch wrapper (if needed):**
```typescript
// ✅ Or use createFetch for native fetch
const authFetch = client.createFetch();

const response = await authFetch('/api/data');
// Token is automatically attached and refreshed on 401
```

---

## Migration from @authvital/node

### Before (Old SDK)

```typescript
// server.ts - Old @authvital/node
import { createAuthVital } from '@authvital/node';

const authvital = createAuthVital({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
});

// JWT validation
app.get('/api/profile', async (req, res) => {
  const { user } = await authvital.getCurrentUser(req);
  
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Make API calls with user token
  const memberships = await authvital.memberships.listForUser(user.id);
  
  res.json({ user, memberships });
});
```

### After (New @authvital/server)

```typescript
// server.ts - New @authvital/server
import { authVitalMiddleware, requireAuth } from '@authvital/server/middleware';
import { createSessionStore } from '@authvital/server/session';

const sessionStore = createSessionStore({
  secret: process.env.SESSION_SECRET!,
  authVitalHost: process.env.AUTHVITAL_HOST!,
  isProduction: process.env.NODE_ENV === 'production',
});

// Apply middleware
app.use(authVitalMiddleware({
  secret: process.env.SESSION_SECRET!,
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
  publicRoutes: ['/login', '/signup', '/api/public'],
}));

// Protected routes
app.get('/api/profile', 
  requireAuth(),
  async (req, res) => {
    // req.authVital is guaranteed to exist
    const user = await req.authVital.client.getCurrentUser();
    res.json({ user });
  }
);
```

### Express Middleware Setup

**Complete Express BFF setup:**

```typescript
// express-server.ts
import express from 'express';
import { 
  authVitalMiddleware, 
  requireAuth,
  setSession,
  clearSession 
} from '@authvital/server/middleware';
import { createSessionStore } from '@authvital/server/session';

const app = express();

// Session store for manual operations
const sessionStore = createSessionStore({
  secret: process.env.SESSION_SECRET!,
  authVitalHost: process.env.AUTHVITAL_HOST!,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
});

// Apply AuthVital middleware to all routes
app.use(authVitalMiddleware({
  secret: process.env.SESSION_SECRET!,
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
  publicRoutes: ['/login', '/signup', '/auth/callback'],
}));

// OAuth callback handler
app.post('/auth/callback', express.json(), async (req, res) => {
  const { code } = req.body;
  
  // Exchange code for tokens
  const tokenResponse = await fetch(`${process.env.AUTHVITAL_HOST}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.AUTHVITAL_CLIENT_ID,
      client_secret: process.env.AUTHVITAL_CLIENT_SECRET,
      code,
      redirect_uri: `${req.headers.origin}/auth/callback`,
    }),
  });
  
  const tokens = await tokenResponse.json();
  
  // Set encrypted session cookie
  setSession(sessionStore, tokens, req, res);
  
  res.json({ success: true });
});

// Protected API routes
app.get('/api/user', requireAuth(), async (req, res) => {
  const user = await req.authVital!.client.getCurrentUser();
  res.json(user);
});

// Logout
app.post('/api/logout', (req, res) => {
  clearSession(sessionStore, res);
  res.json({ success: true });
});
```

### Server-Side Session Management

**Creating a session:**
```typescript
import { setSession } from '@authvital/server/middleware';

// After OAuth callback, store tokens in encrypted cookie
app.post('/api/auth/callback', async (req, res) => {
  const tokens = await exchangeCodeForTokens(req.body.code);
  
  // Creates encrypted session cookie
  setSession(sessionStore, tokens, req, res);
  
  res.redirect('/dashboard');
});
```

**Clearing a session:**
```typescript
import { clearSession } from '@authvital/server/middleware';

app.post('/api/logout', (req, res) => {
  clearSession(sessionStore, res);
  res.json({ success: true });
});
```

### Encrypted Cookies

The new SDK uses AES-256-GCM encryption for session cookies:

```typescript
import { createSessionStore } from '@authvital/server/session';

const sessionStore = createSessionStore({
  secret: process.env.SESSION_SECRET!, // 32+ character secret
  authVitalHost: process.env.AUTHVITAL_HOST!,
  cookie: {
    name: 'authvital_session',    // Cookie name
    httpOnly: true,               // Prevents XSS access
    secure: true,                 // HTTPS only in production
    sameSite: 'lax',              // CSRF protection
    maxAge: 30 * 24 * 60 * 60,    // 30 days
  },
});

// Session data stored in cookie (encrypted):
// {
//   accessToken: string,     // Short-lived access token
//   refreshToken: string,      // Long-lived refresh token
//   expiresAt: number,         // Token expiration timestamp
//   sessionId: string,         // Unique session identifier
// }
```

---

## Backend Compatibility

### Ensure Backend is Updated to Strict Authorization Header

Your backend API must be updated to only accept tokens via the `Authorization: Bearer` header.

**Backend API Implementation:**

```typescript
// api/middleware/auth.ts
import { JWTParser } from '@authvital/core';

export function authenticateRequest(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      code: 'MISSING_AUTH_HEADER',
    });
  }
  
  const token = authHeader.substring(7);
  
  // Validate JWT (using JWKS from AuthVital)
  const parser = new JWTParser({
    jwksUri: `${process.env.AUTHVITAL_HOST}/.well-known/jwks.json`,
  });
  
  const result = parser.validate(token);
  
  if (!result.valid) {
    return res.status(401).json({
      error: 'Unauthorized',
      code: 'INVALID_TOKEN',
    });
  }
  
  req.user = result.payload;
  next();
}
```

### Refresh Token Endpoint Requirements

Your backend must implement a refresh token endpoint that:
1. Accepts the refresh token (from httpOnly cookie or secure storage)
2. Calls the AuthVital token endpoint
3. Returns the new access token

**Browser/SPA Refresh Flow:**
```typescript
// Browser SDK handles this automatically
// The refresh token is stored in an httpOnly cookie by AuthVital IDP
```

**Server Refresh Flow:**
```typescript
// Server SDK handles this automatically in middleware
// Tokens are refreshed before expiration and session cookie is rotated
```

---

## Security Improvements

### XSS Protection via In-Memory Tokens

**Problem with localStorage:**
```javascript
// ❌ XSS attack can steal tokens from localStorage
const stolenToken = localStorage.getItem('access_token');
```

**Solution with in-memory storage:**
```typescript
// ✅ Token exists only in JavaScript closure
// Not accessible to XSS attacks
import { AuthVitalClient } from '@authvital/browser';

const client = new AuthVitalClient(config);
// Token is stored in a module-scoped variable, not localStorage
```

### CSRF Protection via httpOnly Refresh Cookies

```typescript
// ✅ Refresh token is httpOnly - not accessible to JavaScript
// Set-Cookie: refresh_token=xxx; HttpOnly; Secure; SameSite=Strict

// Browser SDK automatically sends this cookie during refresh
await client.refreshToken(); // Cookie sent automatically
```

### Encrypted Server Sessions

```typescript
// ✅ Server sessions use AES-256-GCM encryption
const sessionStore = createSessionStore({
  secret: 'your-32-character-secret-key-here!!',
  // All session data is encrypted before being set as cookie
});

// Session cookie contains encrypted data:
// authvital_session=U2FsdGVkX1+vupppZksvRf5pq5g5XjFRlipTg9+MvKLJmzJ...
```

### Security Checklist

- [ ] Removed all `localStorage.getItem('token')` calls
- [ ] Backend only accepts `Authorization: Bearer` header
- [ ] httpOnly cookies for refresh tokens
- [ ] Encrypted session cookies on server
- [ ] CSRF protection enabled (`sameSite: 'lax'` or `'strict'`)
- [ ] HTTPS in production (`secure: true`)

---

## Quick Start Examples

### Browser/SPA Quick Start

```bash
npm install @authvital/browser
```

```tsx
// main.tsx
import { AuthVitalProvider } from '@authvital/browser/react';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AuthVitalProvider
    clientId="your-client-id"
    authVitalHost="https://auth.myapp.com"
    redirectUri={`${window.location.origin}/auth/callback`}
    onAuthRequired={() => window.location.href = '/login'}
    onRefreshFailed={() => window.location.href = '/login'}
  >
    <App />
  </AuthVitalProvider>
);

// App.tsx
import { useAuth, useApi } from '@authvital/browser/react';

function App() {
  const { user, isAuthenticated, login, logout } = useAuth();
  const api = useApi();
  
  useEffect(() => {
    if (isAuthenticated) {
      // API calls automatically include auth headers
      api.get('/api/profile').then(r => console.log(r.data));
    }
  }, [isAuthenticated, api]);
  
  if (!isAuthenticated) {
    return <button onClick={() => login()}>Sign In</button>;
  }
  
  return (
    <div>
      <p>Welcome, {user?.email}</p>
      <button onClick={() => logout()}>Sign Out</button>
    </div>
  );
}

// auth/callback/page.tsx
import { useAuth } from '@authvital/browser/react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function AuthCallback() {
  const { handleCallback } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    handleCallback().then(result => {
      if (result.success) {
        navigate('/dashboard');
      } else {
        navigate('/login?error=' + result.errorCode);
      }
    });
  }, [handleCallback, navigate]);
  
  return <div>Processing login...</div>;
}
```

### Next.js App Router Quick Start

```bash
npm install @authvital/server @authvital/browser
```

```typescript
// middleware.ts
import { createAuthMiddleware } from '@authvital/server/middleware';

export default createAuthMiddleware({
  secret: process.env.SESSION_SECRET!,
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
  publicPaths: ['/login', '/signup', '/auth/callback'],
  loginPath: '/login',
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

```typescript
// app/layout.tsx (Server Component)
import { cookies } from 'next/headers';
import { getServerAuth } from '@authvital/server/middleware';
import { AuthVitalProvider } from '@authvital/browser/react';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getServerAuth(cookies(), {
    secret: process.env.SESSION_SECRET!,
    authVitalHost: process.env.AUTHVITAL_HOST!,
    clientId: process.env.AUTHVITAL_CLIENT_ID!,
    clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
  });

  return (
    <html>
      <body>
        <AuthVitalProvider
          clientId={process.env.AUTHVITAL_CLIENT_ID!}
          authVitalHost={process.env.AUTHVITAL_HOST!}
          initialState={{
            isAuthenticated: auth.isAuthenticated,
            user: auth.isAuthenticated ? await auth.client.getCurrentUser() : null,
            accessToken: auth.accessToken,
          }}
        >
          {children}
        </AuthVitalProvider>
      </body>
    </html>
  );
}
```

```typescript
// app/api/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { setRouteSession } from '@authvital/server/middleware';

export async function POST(request: NextRequest) {
  const { code } = await request.json();
  
  // Exchange code for tokens
  const tokenRes = await fetch(`${process.env.AUTHVITAL_HOST}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.AUTHVITAL_CLIENT_ID,
      client_secret: process.env.AUTHVITAL_CLIENT_SECRET,
      code,
      redirect_uri: `${request.headers.get('origin')}/auth/callback`,
    }),
  });
  
  const tokens = await tokenRes.json();
  
  // Set session cookie and redirect
  const response = NextResponse.redirect(new URL('/dashboard', request.url));
  
  setRouteSession(tokens, response, {
    secret: process.env.SESSION_SECRET!,
    authVitalHost: process.env.AUTHVITAL_HOST!,
  });
  
  return response;
}
```

### Express BFF Quick Start

```bash
npm install @authvital/server
```

```typescript
// server.ts
import express from 'express';
import { 
  authVitalMiddleware, 
  requireAuth,
  setSession,
  clearSession 
} from '@authvital/server/middleware';
import { createSessionStore } from '@authvital/server/session';
import { createServerClient } from '@authvital/server/client';

const app = express();
app.use(express.json());

// Session configuration
const sessionStore = createSessionStore({
  secret: process.env.SESSION_SECRET!,
  authVitalHost: process.env.AUTHVITAL_HOST!,
  isProduction: process.env.NODE_ENV === 'production',
});

// Apply AuthVital middleware
app.use(authVitalMiddleware({
  secret: process.env.SESSION_SECRET!,
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
  publicRoutes: ['/login', '/signup', '/api/auth/callback', '/api/public'],
}));

// OAuth callback
app.post('/api/auth/callback', async (req, res) => {
  const { code } = req.body;
  
  const tokenRes = await fetch(`${process.env.AUTHVITAL_HOST}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.AUTHVITAL_CLIENT_ID,
      client_secret: process.env.AUTHVITAL_CLIENT_SECRET,
      code,
      redirect_uri: req.body.redirectUri,
    }),
  });
  
  const tokens = await tokenRes.json();
  setSession(sessionStore, tokens, req, res);
  
  res.json({ success: true });
});

// Protected routes
app.get('/api/profile', requireAuth(), async (req, res) => {
  const user = await req.authVital!.client.getCurrentUser();
  res.json(user);
});

// Logout
app.post('/api/logout', (req, res) => {
  clearSession(sessionStore, res);
  res.json({ success: true });
});

// Machine-to-machine calls (using client credentials)
app.get('/api/admin/users', requireAuth(), async (req, res) => {
  // For M2M calls, create a server client with client credentials
  const adminClient = createServerClient({
    authVitalHost: process.env.AUTHVITAL_HOST!,
    clientId: process.env.AUTHVITAL_CLIENT_ID!,
    clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
  });
  
  const users = await adminClient.get('/api/admin/users');
  res.json(users);
});

app.listen(3001, () => {
  console.log('BFF server running on port 3001');
});
```

---

## Troubleshooting

### Common Issues

**Issue: "useAuth must be used within an AuthVitalProvider"**
- Ensure `AuthVitalProvider` is at the root of your component tree
- Check for duplicate React versions

**Issue: Tokens not persisting after refresh**
- Verify `redirectUri` is configured correctly
- Check that the OAuth callback is properly handling the authorization code

**Issue: 401 errors on API calls**
- Ensure backend strictly requires `Authorization: Bearer` header
- Check that the access token hasn't expired (SDK should auto-refresh)

**Issue: Session not working in Next.js**
- Verify `SESSION_SECRET` is at least 32 characters
- Check cookie configuration (httpOnly, secure, sameSite)
- Ensure middleware matcher includes your routes

### Migration Checklist

- [ ] Install new packages (`@authvital/browser`, `@authvital/server`, or `@authvital/core`)
- [ ] Remove old packages (`@authvital/react`, `@authvital/node`)
- [ ] Update imports to new package paths
- [ ] Migrate localStorage token storage to in-memory
- [ ] Update backend to require `Authorization: Bearer` header
- [ ] Implement OAuth callback handler
- [ ] Configure encrypted session cookies (server)
- [ ] Test authentication flow end-to-end
- [ ] Update environment variables (SESSION_SECRET for server)
- [ ] Deploy and monitor for errors

---

## Support

For migration support:
- **Documentation**: https://docs.authvital.com
- **GitHub Issues**: https://github.com/intersparkio/authvital/issues
- **Discord**: https://discord.gg/authvital

---

*Last updated: 2024*
