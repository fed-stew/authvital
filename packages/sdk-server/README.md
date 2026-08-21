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
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
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
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
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
    authVitalHost: process.env.AV_HOST!,
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
    authVitalHost: process.env.AV_HOST!,
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

### 🛑 Handling `interaction_required`

When a tenant's MFA policy blocks a session (e.g. the policy is `REQUIRED`
and the user's enrollment grace period expired), the IdP rejects the token
refresh with a 401/403 whose body is `{ error: 'interaction_required' }`.
The SDK surfaces this as a typed `InteractionRequiredError` from
`OAuthFlow.refreshTokens()` and `ServerClient` refresh paths.

**Do not retry** — refresh will never succeed. Catch it, clear the session,
and redirect the user back through `/oauth/authorize` (the hosted flow will
interrupt into MFA enrollment and resume automatically):

```typescript
import { InteractionRequiredError, OAuthFlow } from '@authvital/server';

try {
  const tokens = await oauth.refreshTokens(session.refreshToken);
  // ... rotate session cookie with new tokens
} catch (err) {
  if (err instanceof InteractionRequiredError) {
    // err.reason e.g. 'mfa_enrollment_required'
    res.setHeader('Set-Cookie', sessionStore.createClearCookieHeader());
    return res.redirect('/auth/login'); // starts a fresh authorize flow
  }
  throw err;
}
```

The framework middlewares handle this for you during their silent refresh:
the session is treated as invalid (cookie cleared where the middleware
manages the response), the request continues unauthenticated, and the
distinction is exposed machine-readably — Express sets
`res.locals.authFailureReason = 'interaction_required'`, NestJS sets
`req.authFailureReason = 'interaction_required'` (readable from guards and
exception filters), and the Next.js helpers return a context with
`failureReason: 'interaction_required'` (the edge middleware redirects to
your login page with `?reason=interaction_required` AND an
`x-authvital-reason: interaction_required` response header, for apps or
proxies that strip query params). Branch on these to restart the authorize
flow instead of showing a generic 401.

#### Breaking-ish change (0.2.0): generic refresh failures

Previously, when a silent token refresh failed for a **generic** reason
(revoked session, `invalid_grant`, IdP unreachable, ...), the middlewares
still attached an authenticated context carrying the **expired** access
token. As of 0.2.0 they no longer do: on ANY refresh failure the session
cookie is cleared and the request continues **unauthenticated**, with the
reason exposed the same way as above but as `'refresh_failed'` (Express:
`res.locals.authFailureReason`, NestJS: `req.authFailureReason`, Next.js
helpers: `failureReason`; the Next.js edge middleware redirects with
`?reason=refresh_failed` plus an `x-authvital-reason: refresh_failed`
response header). If your app relied on receiving a stale
`req.authVital` after a failed refresh, treat these requests as logged-out
instead.

---

### Typed Pub/Sub Event Consumption

Subscribing to AuthVital's GCP Pub/Sub events? `@authvital/server/pubsub`
parses and validates the message envelope (pull Messages AND push HTTP
bodies — no dependency on `@google-cloud/pubsub`), routes events to typed
handlers, and deduplicates at-least-once redeliveries:

```typescript
import {
  createPubSubDispatcher,
  parsePubSubMessage,
  InMemoryDedupeStore,
} from '@authvital/server/pubsub';

const dispatcher = createPubSubDispatcher({ dedupeStore: new InMemoryDedupeStore() })
  .on('member.joined', async (event) => {
    // event.data is fully typed for this event
    await db.members.upsert(event.data.membership_id, event.data.tenant_roles);
  })
  .on('license.*', async (event) => refreshEntitlements(event.tenant_id));

subscription.on('message', async (message) => {
  await dispatcher.dispatch(parsePubSubMessage(message));
  message.ack();
});
```

Push endpoints get a framework-agnostic helper (`createPubSubPushHandler`)
with correct Pub/Sub retry-semantics status mapping. The bundled dedupe
store is per-process; implement the two-method `DedupeStore` interface over
Redis/your DB for scaled-out consumers. Full guide: the GCP Pub/Sub page in
the documentation site.

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
  authVitalHost: process.env.AV_HOST!,
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
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
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
    authVitalHost: process.env.AV_HOST!,
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
    authVitalHost: process.env.AV_HOST!,
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

#### Clearing the session cookie (RSC gap)

`getServerAuth` runs in a Server Component and **cannot** clear cookies. When
it reports `failureReason`, clear the stale session from a route handler or
server action with `clearSessionCookie` — it uses the exact same cookie
name/options as the middleware:

```typescript
// app/api/logout/route.ts — NextResponse flavor
import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@authvital/server/nextjs';

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/login', request.url));
  clearSessionCookie(response, {
    secret: process.env.SESSION_SECRET!,
    authVitalHost: process.env.AV_HOST!,
  });
  return response;
}
```

```typescript
// app/actions.ts — server action flavor (mutable cookie store)
'use server';
import { cookies } from 'next/headers';
import { clearSessionCookie } from '@authvital/server/nextjs';

export async function logout() {
  clearSessionCookie(await cookies(), {
    secret: process.env.SESSION_SECRET!,
    authVitalHost: process.env.AV_HOST!,
  });
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
    authVitalHost: process.env.AV_HOST!,
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

// Server-to-server (M2M) calls via the integration client.
// The integration client uses the Client Credentials grant automatically.
const adminClient = createServerClient({
  authVitalHost: 'https://auth.example.com',
  clientId: 'admin-client-id',
  clientSecret: 'admin-client-secret',
});

const members = await adminClient.integration.listTenantMembers({ tenantId: 'tenant-123' });
```

---

## The SDK's role (hosted-first)

AuthVital is **hosted-first**. The console at `/tenant/:tenantId/*` is the
canonical place your customers manage users, app/product access, SSO, domains,
licenses, billing and audit. The SDK deliberately does **not** re-implement that
UI. Its job is:

1. **Auth + JWT claims** — OAuth/PKCE, sessions, token refresh.
2. **Gating** — `client.hasPermission(...)` (fail-closed, delegates to the
   backend guard) for server-side authorization decisions.
3. **Entitlement reads (user token)** — `client.checkLicense`,
   `client.checkLicenseFeature`, `client.getAppLicensedUsers`,
   `client.countLicensedUsers`. These run on the **end user's** access token and
   derive `tenantId` from the JWT, so they take **no `tenantId` param**.
4. **M2M automation** — `client.integration.*` (Client Credentials) for
   server-to-server writes/reads that act as your app.
5. **Deep-links into the hosted console** — via `@authvital/core`.

### Entitlement reads (user token)

```typescript
// `client` carries the user's SessionTokens; tenantId comes from the JWT.
const lic = await client.checkLicense({ userId, applicationId });          // LicenseCheckResult
const { hasFeature } = await client.checkLicenseFeature({ userId, applicationId, featureKey: 'sso' });
const users = await client.getAppLicensedUsers({ applicationId });          // LicensedUser[]
const { count } = await client.countLicensedUsers({ applicationId });
```

### M2M automation (`client.integration.*`)

```typescript
// setMemberRole assigns an APPLICATION role: roleId = an app Role id + applicationId.
await adminClient.integration.setMemberRole({ membershipId, roleId, applicationId });

// sendInvitation requires a singular roleId (a TenantRole id); clientId drives
// the accept redirect.
await adminClient.integration.sendInvitation({
  tenantId, email: 'new@corp.com', roleId, clientId: process.env.AV_CLIENT_ID!, expiresInDays: 7,
});

// License automation (writes act as your app):
await adminClient.integration.grantLicense({ userId, tenantId, applicationId, licenseTypeId });
```

> **M2M `IntegrationClient` = automation. Hosted console = the UI.** For humans
> managing a tenant, deep-link into the console rather than rebuilding CRUD.

### Deep-links into the hosted console (`@authvital/core`)

```typescript
import { getManagementUrls, getAccountSettingsUrl } from '@authvital/core';

const urls = getManagementUrls({ authVitalHost: process.env.AV_HOST!, tenantId });
// urls.members / urls.applications / urls.accessMatrix / urls.licenses /
// urls.billing / urls.audit / urls.sso / urls.domains / urls.settings
const account = getAccountSettingsUrl(process.env.AV_HOST!); // /account/settings
```

See the docs' [OAuth Flow](https://authvital.dev/sdk/server-sdk/oauth-flow/) page
for the full helper→route table (including `getAppPickerUrl`/`getOrgPickerUrl`).

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
