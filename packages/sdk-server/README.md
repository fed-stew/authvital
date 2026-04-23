# @authvital/server

<p align="center">
  <strong>Server SDK for AuthVital</strong><br/>
  Secure session management for Next.js, Express, and other server environments.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@authvital/server">
    <img src="https://img.shields.io/npm/v/@authvital/server.svg" alt="npm version" />
  </a>
  <a href="https://www.npmjs.com/package/@authvital/server">
    <img src="https://img.shields.io/npm/dm/@authvital/server.svg" alt="npm downloads" />
  </a>
  <a href="https://github.com/authvital/authvital/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/@authvital/server.svg" alt="license" />
  </a>
  <a href="https://github.com/authvital/authvital">
    <img src="https://img.shields.io/badge/TypeScript-Ready-blue.svg" alt="typescript" />
  </a>
</p>

---

## What is @authvital/server?

`@authvital/server` is the server-side SDK for AuthVital authentication. It provides a secure **Backend-for-Frontend (BFF)** adapter that handles encrypted session cookies, automatic token refresh, and seamless integration with popular frameworks.

### Key Capabilities

- **🔐 Encrypted Session Cookies** — AES-256-GCM encryption for secure token storage in httpOnly cookies
- **🚀 Framework Adapters** — First-class support for **Next.js** (App & Pages Router) and **Express**
- **⚡ SSR/SSG Compatible** — Works seamlessly with Server-Side Rendering and Static Site Generation
- **🔄 Automatic Token Refresh** — Silent refresh on expired tokens with session rotation
- **🛡️ Security First** — Secure defaults with httpOnly, SameSite, and secure cookie attributes

---

## Installation

```bash
npm install @authvital/server @authvital/core
```

Or with your preferred package manager:

```bash
# Yarn
yarn add @authvital/server @authvital/core

# pnpm
pnpm add @authvital/server @authvital/core

# Bun
bun add @authvital/server @authvital/core
```

---

## Quick Start

### Express Middleware Setup

```typescript
import express from 'express';
import { authVitalMiddleware, requireAuth } from '@authvital/server';

const app = express();

// Initialize AuthVital middleware
app.use(authVitalMiddleware({
  secret: process.env.SESSION_SECRET!,      // Min 32 chars
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
  publicRoutes: ['/login', '/api/public'],
}));

// Protected route
app.get('/api/profile', requireAuth(), async (req, res) => {
  const user = await req.authVital!.client.getCurrentUser();
  res.json({ user });
});

app.listen(3000);
```

### Next.js App Router Setup

```typescript
// middleware.ts
import { createAuthMiddleware } from '@authvital/server/nextjs';

export default createAuthMiddleware({
  secret: process.env.SESSION_SECRET!,
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
  publicPaths: ['/login', '/signup'],
  loginPath: '/login',
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

```typescript
// app/dashboard/page.tsx
import { requireServerAuth } from '@authvital/server/nextjs';
import { cookies } from 'next/headers';

export default async function DashboardPage() {
  const auth = await requireServerAuth(cookies(), {
    secret: process.env.SESSION_SECRET!,
    authVitalHost: process.env.AUTHVITAL_HOST!,
    clientId: process.env.CLIENT_ID!,
    clientSecret: process.env.CLIENT_SECRET!,
  }, { loginPath: '/login' });

  const user = await auth.client.getCurrentUser();
  return <div>Welcome, {user?.email}</div>;
}
```

### Next.js Pages Router Setup

```typescript
// pages/dashboard.tsx
import { getServerSideAuth } from '@authvital/server/nextjs';
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async (context) => {
  const auth = await getServerSideAuth(context, {
    secret: process.env.SESSION_SECRET!,
    authVitalHost: process.env.AUTHVITAL_HOST!,
    clientId: process.env.CLIENT_ID!,
    clientSecret: process.env.CLIENT_SECRET!,
  });

  if (!auth.isAuthenticated) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  const user = await auth.client.getCurrentUser();
  return { props: { user: user ?? null } };
};
```

---

## Features

### 🔐 AES-256-GCM Encryption

Session cookies are encrypted using industry-standard AES-256-GCM authenticated encryption, ensuring both confidentiality and integrity of stored tokens.

```typescript
import { createSessionStore } from '@authvital/server';

const store = createSessionStore({
  secret: process.env.SESSION_SECRET!, // 32+ character encryption key
});
```

### 🍪 httpOnly Secure Cookies

Tokens are stored in httpOnly, secure cookies by default, preventing:
- XSS attacks via `document.cookie` access
- Token leakage over insecure connections
- Cross-site request forgery (CSRF)

```typescript
// Default secure cookie settings
{
  httpOnly: true,    // Not accessible via JavaScript
  secure: true,     // HTTPS only in production
  sameSite: 'lax',  // CSRF protection
  maxAge: 2592000,  // 30 days
}
```

### 🔄 Session Rotation

Automatic session rotation ensures:
- Fresh encryption keys on each token refresh
- Invalidation of old sessions after refresh
- Graceful handling of concurrent requests

```typescript
// Automatic rotation on token refresh
const auth = await getRouteAuth(request, config);
// If token was refreshed, session cookie is automatically updated
```

### 🔄 Token Refresh

Silent token refresh with configurable strategy:

```typescript
// Automatic refresh when token is near expiry
const auth = await getRouteAuth(request, {
  ...config,
  refreshBuffer: 5 * 60 * 1000, // Refresh if expires within 5 minutes
});
```

---

## Framework Guides

### Express

Complete Express integration with middleware and route protection:

```typescript
import express from 'express';
import {
  authVitalMiddleware,
  requireAuth,
  setSession,
  clearSession,
  createSessionStore,
} from '@authvital/server';

const app = express();

// Session store (can be shared across routes)
const sessionStore = createSessionStore({
  secret: process.env.SESSION_SECRET!,
  authVitalHost: process.env.AUTHVITAL_HOST!,
});

// Apply middleware
app.use(authVitalMiddleware({
  sessionStore,
  publicRoutes: ['/login', '/signup', '/api/public/*'],
}));

// Public route
app.get('/api/public/status', (req, res) => {
  res.json({ status: 'ok' });
});

// Protected API route
app.get('/api/user', requireAuth(), async (req, res) => {
  const user = await req.authVital!.client.getCurrentUser();
  res.json(user);
});

// Login handler
app.post('/api/login', async (req, res) => {
  // Authenticate with your backend
  const tokens = await authenticateUser(req.body);
  
  // Set encrypted session cookie
  setSession(sessionStore, tokens, req, res);
  
  res.json({ success: true });
});

// Logout handler
app.post('/api/logout', (req, res) => {
  clearSession(sessionStore, req, res);
  res.json({ success: true });
});

// Error handling for auth errors
app.use((err, req, res, next) => {
  if (err.name === 'AuthVitalError') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next(err);
});
```

### Next.js App Router

Modern Next.js integration with App Router and Server Components:

```typescript
// middleware.ts - Edge middleware for auth checks
import { createAuthMiddleware } from '@authvital/server/nextjs';

export default createAuthMiddleware({
  secret: process.env.SESSION_SECRET!,
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
  publicPaths: ['/login', '/signup', '/forgot-password'],
  loginPath: '/login',
  cookieOptions: {
    name: 'authvital_session',
    maxAge: 30 * 24 * 60 * 60,
  },
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

```typescript
// app/dashboard/page.tsx - Server Component with auth
import { requireServerAuth } from '@authvital/server/nextjs';
import { cookies } from 'next/headers';

export default async function DashboardPage() {
  // Validates session and auto-refreshes tokens
  const auth = await requireServerAuth(cookies(), {
    secret: process.env.SESSION_SECRET!,
    authVitalHost: process.env.AUTHVITAL_HOST!,
    clientId: process.env.CLIENT_ID!,
    clientSecret: process.env.CLIENT_SECRET!,
  }, { loginPath: '/login' });

  // Make authenticated API calls
  const user = await auth.client.getCurrentUser();
  const memberships = await auth.client.getTenantMemberships();

  return (
    <div>
      <h1>Welcome, {user?.email}</h1>
      <pre>{JSON.stringify(memberships, null, 2)}</pre>
    </div>
  );
}
```

```typescript
// app/api/user/route.ts - API Route with auth
import { NextRequest, NextResponse } from 'next/server';
import { getRouteAuth } from '@authvital/server/nextjs';

export async function GET(request: NextRequest) {
  const auth = await getRouteAuth(request, {
    secret: process.env.SESSION_SECRET!,
    authVitalHost: process.env.AUTHVITAL_HOST!,
    clientId: process.env.CLIENT_ID!,
    clientSecret: process.env.CLIENT_SECRET!,
  });

  if (!auth.isAuthenticated) {
    return NextResponse.json(
      { error: 'Unauthorized' }, 
      { status: 401 }
    );
  }

  const user = await auth.client.getCurrentUser();
  return NextResponse.json({ user });
}
```

### Next.js Pages Router

Legacy Pages Router support with `getServerSideProps`:

```typescript
// pages/dashboard.tsx - Page with SSR auth
import { getServerSideAuth } from '@authvital/server/nextjs';
import type { GetServerSideProps } from 'next';

interface DashboardProps {
  user: {
    id: string;
    email: string;
    name: string;
  } | null;
}

export const getServerSideProps: GetServerSideProps<DashboardProps> = async (
  context
) => {
  const auth = await getServerSideAuth(context, {
    secret: process.env.SESSION_SECRET!,
    authVitalHost: process.env.AUTHVITAL_HOST!,
    clientId: process.env.CLIENT_ID!,
    clientSecret: process.env.CLIENT_SECRET!,
  });

  if (!auth.isAuthenticated) {
    return {
      redirect: {
        destination: '/login?redirect=' + encodeURIComponent(context.resolvedUrl),
        permanent: false,
      },
    };
  }

  const user = await auth.client.getCurrentUser();

  return {
    props: {
      user: user ?? null,
    },
  };
};

export default function DashboardPage({ user }: DashboardProps) {
  if (!user) return null;
  
  return (
    <div>
      <h1>Welcome, {user.name}</h1>
      <p>Email: {user.email}</p>
    </div>
  );
}
```

### API Routes

Server-side API client for direct AuthVital API access:

```typescript
import { createServerClient } from '@authvital/server';

// Create authenticated client
const client = createServerClient({
  authVitalHost: 'https://auth.example.com',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
}, {
  accessToken: 'user-access-token',
  refreshToken: 'user-refresh-token',
});

// Make authenticated API calls
const user = await client.getCurrentUser();
const tenants = await client.getTenantMemberships();

// Server-to-server calls (admin operations)
const adminClient = createServerClient({
  authVitalHost: 'https://auth.example.com',
  clientId: 'admin-client-id',
  clientSecret: 'admin-client-secret',
});

const allUsers = await adminClient.admin.listUsers();
```

---

## Security

### Cookie Encryption

All session data is encrypted using **AES-256-GCM** authenticated encryption:

```typescript
import { createSessionCookie, parseSessionCookie } from '@authvital/server';

// Encrypt tokens for storage
const encrypted = createSessionCookie(
  { accessToken, refreshToken, expiresAt },
  process.env.SESSION_SECRET!
);

// Decrypt and validate on read
const tokens = parseSessionCookie(encrypted, process.env.SESSION_SECRET!);
```

**Security Properties:**
- **Confidentiality**: AES-256 encryption ensures data cannot be read without the key
- **Integrity**: GCM mode prevents tampering with encrypted data
- **Authenticated**: 96-bit IV + 128-bit authentication tag for each encryption

### SameSite Protection

Cookies use `SameSite=Lax` by default for CSRF protection:

```typescript
// Secure defaults
{
  sameSite: 'lax',  // Protects against CSRF while allowing top-level navigation
  httpOnly: true,   // Prevents XSS via document.cookie
  secure: true,     // HTTPS-only in production
}

// Strict mode for enhanced security
{
  sameSite: 'strict',
  // Note: May break OAuth redirects
}
```

### Token Rotation

Automatic token rotation enhances security:

```typescript
// When tokens are refreshed, the session is updated with:
// 1. New access token
// 2. New refresh token (if rotation is enabled)
// 3. Updated expiration timestamp

const auth = await getRouteAuth(request, {
  ...config,
  onTokenRefresh: (newTokens, oldTokens) => {
    // Optional: Log token rotation for audit
    console.log('Token rotated for session:', oldTokens.sessionId);
  },
});
```

**Benefits:**
- Limits exposure window of compromised tokens
- Prevents replay attacks with old tokens
- Enables secure session invalidation

---

## License

MIT © AuthVital

---

<p align="center">
  <a href="https://authvital.dev">Documentation</a> •
  <a href="https://github.com/authvital/authvital">GitHub</a> •
  <a href="https://authvital.dev/support">Support</a>
</p>
