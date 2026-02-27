# Complete AuthVital SDK Setup Guide

> 🚀 Walk through a **complete integration** of AuthVital into your application, from zero to production-ready.

This guide takes you step-by-step through integrating AuthVital authentication, authorization, and identity sync into your application. By the end, you'll have:

- ✅ OAuth 2.0 PKCE authentication flow
- ✅ JWT validation and protected routes
- ✅ Permission-based access control
- ✅ Real-time identity sync via webhooks
- ✅ React frontend with auth state management
- ✅ Multi-tenant support

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Architecture Overview](#architecture-overview)
- [Installation](#installation)
- [Backend Setup](#backend-setup)
  - [Environment Variables](#1-environment-variables)
  - [Create AuthVital Client](#2-create-authvital-client)
  - [Auth API Routes (Express)](#3-auth-api-routes-express)
  - [Auth API Routes (Next.js)](#4-auth-api-routes-nextjs)
  - [Protected Middleware](#5-protected-middleware)
- [Database Setup (Identity Sync)](#database-setup-identity-sync)
  - [Prisma Schema](#1-prisma-schema)
  - [Run Migration](#2-run-migration)
  - [Webhook Handler](#3-webhook-handler)
  - [Configure in AuthVital Dashboard](#4-configure-in-authvital-dashboard)
- [Frontend Setup](#frontend-setup)
  - [Provider Wrapper](#1-provider-wrapper)
  - [Auth Hook Usage](#2-auth-hook-usage)
  - [Protected Route Component](#3-protected-route-component)
- [Testing Your Integration](#testing-your-integration)
- [Common Patterns](#common-patterns)
  - [Org/Tenant Picker](#1-orgtenant-picker)
  - [Permission-Based UI](#2-permission-based-ui)
  - [License-Gated Features](#3-license-gated-features)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

---

## Prerequisites

Before starting, ensure you have:

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | 18.0+ | Required for ES modules and native fetch |
| **AuthVital Application** | - | You need a `clientId` and `clientSecret` from the AuthVital dashboard |
| **Database** | PostgreSQL recommended | For identity sync; other Prisma-supported databases work too |
| **Package Manager** | npm, yarn, or pnpm | Any works fine |

### Getting Your Credentials

1. Log into the [AuthVital Dashboard](https://dashboard.authvital.com)
2. Navigate to **Applications** → **Create Application** (or select existing)
3. Note your:
   - **Client ID**: `av_app_xxxxxxxx`
   - **Client Secret**: `av_secret_xxxxxxxx`
   - **AuthVital Host**: `https://auth.yourcompany.com` (or your custom domain)
4. Set up **Redirect URIs** for OAuth callbacks:
   - Development: `http://localhost:3000/api/auth/callback`
   - Production: `https://yourapp.com/api/auth/callback`

---

## Architecture Overview

Here's how all the pieces fit together:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           YOUR APPLICATION                                        │
│                                                                                   │
│  ┌─────────────────────┐         ┌─────────────────────┐                         │
│  │     FRONTEND        │         │      BACKEND        │                         │
│  │    (React/Next)     │         │  (Express/Next API) │                         │
│  │                     │         │                     │                         │
│  │  ┌───────────────┐  │  REST   │  ┌───────────────┐  │                         │
│  │  │ AuthVital     │  │ ◄─────► │  │ Auth Routes   │  │                         │
│  │  │ Provider      │  │         │  │ /api/auth/*   │  │                         │
│  │  └───────────────┘  │         │  └───────────────┘  │                         │
│  │         │           │         │         │           │                         │
│  │         ▼           │         │         ▼           │                         │
│  │  ┌───────────────┐  │         │  ┌───────────────┐  │                         │
│  │  │ useAuth()     │  │         │  │ getCurrentUser│  │                         │
│  │  │ Hook          │  │         │  │ JWT Validation│  │                         │
│  │  └───────────────┘  │         │  └───────────────┘  │                         │
│  │                     │         │         │           │                         │
│  └─────────────────────┘         │         ▼           │                         │
│                                  │  ┌───────────────┐  │      ┌────────────────┐ │
│                                  │  │ Webhook       │◄─┼──────│ YOUR DATABASE  │ │
│                                  │  │ Handler       │  │      │ (PostgreSQL)   │ │
│                                  │  └───────────────┘  │      │                │ │
│                                  └─────────────────────┘      │ av_identities  │ │
│                                           ▲                   │ av_sessions    │ │
└───────────────────────────────────────────┼───────────────────┴────────────────┴─┘
                                            │
                    OAuth Flow + Webhooks   │
                                            ▼
                             ┌──────────────────────────┐
                             │      AUTHVITAL IDP       │
                             │                          │
                             │  • User Authentication   │
                             │  • Token Issuance        │
                             │  • JWKS Endpoint         │
                             │  • Webhook Dispatch      │
                             │  • Tenant Management     │
                             │  • License Management    │
                             └──────────────────────────┘
```

### Data Flow

| Step | Action | Components Involved |
|------|--------|--------------------|
| 1️⃣ | User clicks "Sign In" | Frontend → Redirect to AuthVital |
| 2️⃣ | User authenticates at AuthVital | AuthVital IDP |
| 3️⃣ | AuthVital redirects back with code | AuthVital → Your Backend |
| 4️⃣ | Backend exchanges code for tokens | Your Backend → AuthVital |
| 5️⃣ | Backend sets httpOnly cookie | Your Backend → Browser |
| 6️⃣ | Frontend gets user data via API | Frontend → Your Backend |
| 7️⃣ | Webhooks sync identity changes | AuthVital → Your Database |

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

## Backend Setup

### 1. Environment Variables

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

> ⚠️ **Never commit `.env` files to git!** Add `.env` to your `.gitignore`.

---

### 2. Create AuthVital Client

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
| `authvital.tenants.*` | Tenant management operations |

---

### 3. Auth API Routes (Express)

Create OAuth routes for Express:

```typescript
// routes/auth.ts
import { Router } from 'express';
import { OAuthFlow } from '@authvital/sdk/server';
import { authvital } from '../lib/authvital';

const router = Router();

// Initialize OAuth flow helper
const oauth = new OAuthFlow({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
  redirectUri: process.env.OAUTH_REDIRECT_URI!,
  // Optional: Add default scopes
  scope: 'openid profile email',
});

/**
 * GET /api/auth/login
 * Initiates OAuth 2.0 PKCE flow
 */
router.get('/login', (req, res) => {
  // Generate authorization URL with PKCE
  const { authorizeUrl, state, codeVerifier } = oauth.startFlow();

  // Store state and verifier in session (for CSRF + PKCE validation)
  req.session.oauthState = state;
  req.session.codeVerifier = codeVerifier;

  // Optional: Store where to redirect after login
  if (req.query.returnTo) {
    req.session.returnTo = req.query.returnTo as string;
  }

  // Redirect user to AuthVital login page
  res.redirect(authorizeUrl);
});

/**
 * GET /api/auth/callback
 * Handles OAuth callback from AuthVital
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error, req.query.error_description);
      return res.redirect('/login?error=' + error);
    }

    // Validate state and exchange code for tokens
    const tokens = await oauth.handleCallback(
      code as string,
      state as string,
      req.session.oauthState,
      req.session.codeVerifier
    );

    // Clear OAuth session data
    delete req.session.oauthState;
    delete req.session.codeVerifier;

    // Set access token as httpOnly cookie (XSS-safe!)
    res.cookie('access_token', tokens.access_token, {
      httpOnly: true,              // JavaScript can't access this
      secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
      sameSite: 'lax',             // CSRF protection
      maxAge: 60 * 60 * 1000,      // 1 hour (match token expiry)
      path: '/',
    });

    // Optional: Store refresh token for token renewal
    if (tokens.refresh_token) {
      res.cookie('refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      });
    }

    // Redirect to dashboard or saved returnTo URL
    const returnTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    res.redirect(returnTo);

  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect('/login?error=callback_failed');
  }
});

/**
 * GET /api/auth/me
 * Returns current user data (or 401 if not authenticated)
 */
router.get('/me', async (req, res) => {
  const { authenticated, user, error } = await authvital.getCurrentUser(req);

  if (!authenticated) {
    return res.status(401).json({ 
      authenticated: false, 
      error: error || 'Not authenticated' 
    });
  }

  // Return user data to frontend
  res.json({
    authenticated: true,
    user: {
      id: user.sub,
      email: user.email,
      name: user.name || `${user.given_name || ''} ${user.family_name || ''}`.trim(),
      picture: user.picture,
      tenantId: user.tenant_id,
      tenantRoles: user.tenant_roles || [],
      appPermissions: user.app_permissions || [],
      license: user.license,
    },
  });
});

/**
 * POST /api/auth/logout
 * Clears auth cookies and ends session
 */
router.post('/logout', (req, res) => {
  // Clear all auth cookies
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });

  // Destroy session
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    res.json({ success: true });
  });
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies.refresh_token;

  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token' });
  }

  try {
    const tokens = await oauth.refreshTokens(refreshToken);

    res.cookie('access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000,
      path: '/',
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
    res.status(401).json({ error: 'Refresh failed' });
  }
});

export default router;
```

**Wire it up in your Express app:**

```typescript
// app.ts
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';

const app = express();

// Middleware
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 10 * 60 * 1000, // 10 minutes (just for OAuth flow)
  },
}));

// Mount auth routes
app.use('/api/auth', authRoutes);

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

---

### 4. Auth API Routes (Next.js)

For Next.js App Router, create route handlers:

```typescript
// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { OAuthFlow } from '@authvital/sdk/server';

const oauth = new OAuthFlow({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
  redirectUri: process.env.OAUTH_REDIRECT_URI!,
});

export async function GET(request: Request) {
  const { authorizeUrl, state, codeVerifier } = oauth.startFlow();

  // Store PKCE values in cookies (short-lived)
  const cookieStore = await cookies();
  cookieStore.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });
  cookieStore.set('code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });

  // Optional: Store return URL
  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get('returnTo');
  if (returnTo) {
    cookieStore.set('auth_return_to', returnTo, {
      httpOnly: true,
      maxAge: 60 * 10,
      path: '/',
    });
  }

  return NextResponse.redirect(authorizeUrl);
}
```

```typescript
// app/api/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { OAuthFlow } from '@authvital/sdk/server';

const oauth = new OAuthFlow({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
  redirectUri: process.env.OAUTH_REDIRECT_URI!,
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get('oauth_state')?.value;
  const codeVerifier = cookieStore.get('code_verifier')?.value;
  const returnTo = cookieStore.get('auth_return_to')?.value || '/dashboard';

  try {
    const tokens = await oauth.handleCallback(
      code!,
      state!,
      savedState,
      codeVerifier
    );

    const response = NextResponse.redirect(new URL(returnTo, request.url));

    // Set auth cookie
    response.cookies.set('access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60, // 1 hour
      path: '/',
    });

    if (tokens.refresh_token) {
      response.cookies.set('refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: '/',
      });
    }

    // Clear OAuth cookies
    response.cookies.delete('oauth_state');
    response.cookies.delete('code_verifier');
    response.cookies.delete('auth_return_to');

    return response;

  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(new URL('/login?error=callback_failed', request.url));
  }
}
```

```typescript
// app/api/auth/me/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authvital } from '@/lib/authvital';

export async function GET(request: NextRequest) {
  const { authenticated, user, error } = await authvital.getCurrentUser(request);

  if (!authenticated) {
    return NextResponse.json(
      { authenticated: false, error: error || 'Not authenticated' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.sub,
      email: user.email,
      name: user.name || `${user.given_name || ''} ${user.family_name || ''}`.trim(),
      picture: user.picture,
      tenantId: user.tenant_id,
      tenantRoles: user.tenant_roles || [],
      appPermissions: user.app_permissions || [],
      license: user.license,
    },
  });
}
```

```typescript
// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.delete('access_token');
  response.cookies.delete('refresh_token');

  return response;
}
```

---

### 5. Protected Middleware

Create reusable middleware for protecting routes:

**Express Middleware:**

```typescript
// middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { authvital } from '../lib/authvital';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        email?: string;
        tenant_id?: string;
        tenant_roles?: string[];
        app_permissions?: string[];
        license?: {
          type: string;
          features: string[];
        };
        [key: string]: any;
      };
    }
  }
}

/**
 * Require authenticated user
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { authenticated, user, error } = await authvital.getCurrentUser(req);

  if (!authenticated) {
    return res.status(401).json({ 
      error: error || 'Unauthorized',
      code: 'UNAUTHORIZED' 
    });
  }

  // Attach user to request for downstream handlers
  req.user = user;
  next();
};

/**
 * Require specific permissions (must have ALL listed permissions)
 */
export const requirePermission = (...permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // First ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        code: 'UNAUTHORIZED' 
      });
    }

    const userPermissions = req.user.app_permissions || [];
    const hasAll = permissions.every(p => userPermissions.includes(p));

    if (!hasAll) {
      const missing = permissions.filter(p => !userPermissions.includes(p));
      return res.status(403).json({
        error: 'Forbidden',
        code: 'MISSING_PERMISSIONS',
        required: permissions,
        missing: missing,
      });
    }

    next();
  };
};

/**
 * Require ANY of the listed permissions
 */
export const requireAnyPermission = (...permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        code: 'UNAUTHORIZED' 
      });
    }

    const userPermissions = req.user.app_permissions || [];
    const hasAny = permissions.some(p => userPermissions.includes(p));

    if (!hasAny) {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'MISSING_PERMISSIONS',
        requiredAny: permissions,
      });
    }

    next();
  };
};

/**
 * Require specific tenant roles
 */
export const requireTenantRole = (...roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        code: 'UNAUTHORIZED' 
      });
    }

    const userRoles = req.user.tenant_roles || [];
    const hasRole = roles.some(r => userRoles.includes(r));

    if (!hasRole) {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'MISSING_ROLE',
        requiredAny: roles,
      });
    }

    next();
  };
};

/**
 * Require a specific license feature
 */
export const requireLicenseFeature = (feature: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        code: 'UNAUTHORIZED' 
      });
    }

    const features = req.user.license?.features || [];

    if (!features.includes(feature)) {
      return res.status(403).json({
        error: 'Feature not available',
        code: 'LICENSE_REQUIRED',
        requiredFeature: feature,
        currentLicense: req.user.license?.type || 'none',
      });
    }

    next();
  };
};
```

**Usage with Express routes:**

```typescript
// routes/api.ts
import { Router } from 'express';
import {
  requireAuth,
  requirePermission,
  requireTenantRole,
  requireLicenseFeature,
} from '../middleware/auth';

const router = Router();

// Basic protected route
router.get('/profile', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Require specific permission
router.get(
  '/admin/users',
  requireAuth,
  requirePermission('users:read'),
  (req, res) => {
    // User has users:read permission
    res.json({ users: [] });
  }
);

// Require multiple permissions
router.delete(
  '/admin/users/:id',
  requireAuth,
  requirePermission('users:read', 'users:delete'),
  (req, res) => {
    // User has BOTH users:read AND users:delete
    res.json({ deleted: true });
  }
);

// Require tenant admin role
router.get(
  '/settings/billing',
  requireAuth,
  requireTenantRole('admin', 'billing_admin'),
  (req, res) => {
    // User is admin OR billing_admin in their tenant
    res.json({ billing: {} });
  }
);

// Require license feature
router.get(
  '/reports/advanced',
  requireAuth,
  requireLicenseFeature('advanced_analytics'),
  (req, res) => {
    // User's license includes advanced_analytics
    res.json({ report: {} });
  }
);

export default router;
```

**Next.js Middleware (Edge Runtime):**

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Routes that require authentication
const protectedRoutes = ['/dashboard', '/settings', '/admin'];

// Routes that are only for non-authenticated users
const authRoutes = ['/login', '/signup'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('access_token')?.value;

  const isProtectedRoute = protectedRoutes.some(route => 
    pathname.startsWith(route)
  );
  const isAuthRoute = authRoutes.some(route => 
    pathname.startsWith(route)
  );

  // Check if user has valid token
  let isAuthenticated = false;
  if (token) {
    try {
      // Note: For full verification, use authvital.getCurrentUser() in API routes
      // This is a quick check for routing purposes only
      const jwksUrl = new URL('/.well-known/jwks.json', process.env.AV_HOST!);
      const jwks = await fetch(jwksUrl).then(r => r.json());
      // Basic token format check (full verification happens in API routes)
      isAuthenticated = !!token && token.split('.').length === 3;
    } catch {
      isAuthenticated = false;
    }
  }

  // Redirect authenticated users away from auth pages
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Redirect unauthenticated users to login
  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL('/api/auth/login', request.url);
    loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - api routes (handled separately)
     * - static files
     * - images
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

---

## Database Setup (Identity Sync)

To maintain a local copy of user identities (for foreign keys, fast queries, etc.), set up identity sync via webhooks.

### 1. Prisma Schema

Add the identity models to your `schema.prisma`:

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

/// Synced identity from AuthVital
/// This is the source of truth for user data in your app
model Identity {
  /// AuthVital subject ID (e.g., "usr_abc123")
  id              String    @id @map("id")

  /// User email (unique when not null)
  email           String?   @unique

  /// Display name
  name            String?

  /// First name
  givenName       String?   @map("given_name")

  /// Last name
  familyName      String?   @map("family_name")

  /// Profile picture URL
  picture         String?

  /// User's locale (e.g., "en-US")
  locale          String?

  /// User's timezone (e.g., "America/New_York")
  timezone        String?

  /// IDP-level active status
  /// false = account deactivated across ALL apps
  isActive        Boolean   @default(true) @map("is_active")

  /// App-level access status
  /// false = user lost access to THIS specific app
  hasAppAccess    Boolean   @default(true) @map("has_app_access")

  /// Subject type: "user", "service_account", or "machine"
  subjectType     String    @default("user") @map("subject_type")

  /// Tenant ID this identity belongs to
  tenantId        String?   @map("tenant_id")

  /// Tenant roles (stored as JSON array)
  tenantRoles     Json      @default("[]") @map("tenant_roles")

  /// App-level permissions (stored as JSON array)
  appPermissions  Json      @default("[]") @map("app_permissions")

  /// Current license type name
  licenseType     String?   @map("license_type")

  /// License features (stored as JSON array)
  licenseFeatures Json      @default("[]") @map("license_features")

  /// When the identity was first synced
  createdAt       DateTime  @default(now()) @map("created_at")

  /// When the identity was last updated
  updatedAt       DateTime  @updatedAt @map("updated_at")

  // ============================================
  // Relations to your app's data
  // ============================================
  sessions        IdentitySession[]
  // Add your own relations here:
  // posts         Post[]
  // comments      Comment[]
  // orders        Order[]

  @@map("av_identities")
}

/// Active sessions for an identity
/// Used for session management and forced logout
model IdentitySession {
  id              String    @id @default(cuid())

  /// Reference to the identity
  identityId      String    @map("identity_id")
  identity        Identity  @relation(fields: [identityId], references: [id], onDelete: Cascade)

  /// JWT ID (jti claim) - unique identifier for this session's token
  jti             String    @unique

  /// When the session/token was issued
  issuedAt        DateTime  @map("issued_at")

  /// When the session/token expires
  expiresAt       DateTime  @map("expires_at")

  /// IP address of the client (optional)
  ipAddress       String?   @map("ip_address")

  /// User agent string (optional)
  userAgent       String?   @map("user_agent")

  /// When this record was created
  createdAt       DateTime  @default(now()) @map("created_at")

  @@index([identityId])
  @@index([expiresAt])
  @@map("av_identity_sessions")
}
```

### 2. Run Migration

Apply the schema changes to your database:

```bash
# Generate and run the migration
npx prisma migrate dev --name add-identity-sync

# Generate the Prisma client
npx prisma generate
```

### 3. Webhook Handler

Set up webhook handling to sync identity changes:

```typescript
// routes/webhooks.ts (Express)
import { Router } from 'express';
import express from 'express';
import { IdentitySyncHandler, WebhookRouter } from '@authvital/sdk/server';
import { prisma } from '../lib/prisma';

const router = Router();

// Create the identity sync handler
const syncHandler = new IdentitySyncHandler(prisma);

// Create the webhook router (handles signature verification + event routing)
const webhookRouter = new WebhookRouter({
  authVitalHost: process.env.AV_HOST!,
  handler: syncHandler,
  // Optional: Customize timestamp tolerance for replay protection
  maxTimestampAge: 300, // 5 minutes (default)
});

// IMPORTANT: Use express.raw() to get raw body for signature verification!
router.post(
  '/authvital',
  express.raw({ type: 'application/json' }),
  webhookRouter.expressHandler()
);

export default router;
```

**Mount the webhook route:**

```typescript
// app.ts
import webhookRoutes from './routes/webhooks';

// Mount BEFORE json() middleware to preserve raw body
app.use('/webhooks', webhookRoutes);

// Then add json() for other routes
app.use(express.json());
```

**Next.js App Router:**

```typescript
// app/webhooks/authvital/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { IdentitySyncHandler, WebhookRouter } from '@authvital/sdk/server';
import { prisma } from '@/lib/prisma';

const syncHandler = new IdentitySyncHandler(prisma);
const webhookRouter = new WebhookRouter({
  authVitalHost: process.env.AV_HOST!,
  handler: syncHandler,
});

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  try {
    await webhookRouter.handleRequest(body, headers);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 400 }
    );
  }
}
```

### 4. Configure in AuthVital Dashboard

1. Log into [AuthVital Dashboard](https://dashboard.authvital.com)
2. Navigate to **Settings** → **Webhooks**
3. Click **Add Webhook**
4. Configure:

   | Field | Value |
   |-------|-------|
   | **Name** | `Production User Sync` (or descriptive name) |
   | **URL** | `https://yourapp.com/webhooks/authvital` |
   | **Events** | Select the events you want to receive |

5. **Recommended events for identity sync:**

   ```
   ✅ subject.created      - New user created
   ✅ subject.updated      - Profile updated
   ✅ subject.deleted      - User permanently deleted
   ✅ subject.deactivated  - User deactivated (isActive = false)

   ✅ member.joined        - User joined tenant
   ✅ member.left          - User left tenant
   ✅ member.role_changed  - Tenant roles updated
   ✅ member.suspended     - User suspended in tenant
   ✅ member.activated     - User reactivated in tenant

   ✅ app_access.granted   - User granted app access
   ✅ app_access.revoked   - User lost app access (hasAppAccess = false)
   ✅ app_access.role_changed - App roles changed

   ✅ license.assigned     - License assigned
   ✅ license.revoked      - License revoked
   ✅ license.changed      - License type changed
   ```

6. Click **Save**

---

## Frontend Setup

### 1. Provider Wrapper

Wrap your app with the AuthVital provider:

```tsx
// app/providers.tsx (Next.js App Router)
'use client';

import { AuthVitalProvider } from '@authvital/sdk/client';
import type { User, Tenant } from '@authvital/sdk/client';

interface ProvidersProps {
  children: React.ReactNode;
  initialUser?: User | null;
  initialTenants?: Tenant[];
}

export function Providers({
  children,
  initialUser = null,
  initialTenants = [],
}: ProvidersProps) {
  return (
    <AuthVitalProvider
      authVitalHost={process.env.NEXT_PUBLIC_AV_HOST!}
      clientId={process.env.NEXT_PUBLIC_AV_CLIENT_ID!}
      initialUser={initialUser}
      initialTenants={initialTenants}
    >
      {children}
    </AuthVitalProvider>
  );
}
```

**Root layout with server-side user loading:**

```tsx
// app/layout.tsx
import { cookies } from 'next/headers';
import { Providers } from './providers';
import { authvital } from '@/lib/authvital';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get user data on server side
  let initialUser = null;
  let initialTenants = [];

  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  if (accessToken) {
    try {
      // Create a mock request object for getCurrentUser
      const mockReq = {
        cookies: { access_token: accessToken },
        headers: {},
      };

      const { authenticated, user } = await authvital.getCurrentUser(mockReq as any);

      if (authenticated && user) {
        initialUser = {
          id: user.sub,
          email: user.email,
          name: user.name || `${user.given_name || ''} ${user.family_name || ''}`.trim(),
          picture: user.picture,
          tenantId: user.tenant_id,
          tenantRoles: user.tenant_roles || [],
          appPermissions: user.app_permissions || [],
          license: user.license,
        };

        // Optionally load tenants for multi-tenant apps
        // initialTenants = await authvital.tenants.listForUser(user.sub);
      }
    } catch (error) {
      console.error('Error loading initial user:', error);
    }
  }

  return (
    <html lang="en">
      <body>
        <Providers initialUser={initialUser} initialTenants={initialTenants}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

### 2. Auth Hook Usage

Use the `useAuth` hook in your components:

```tsx
// components/UserMenu.tsx
'use client';

import { useAuth } from '@authvital/sdk/client';
import { useState } from 'react';

export function UserMenu() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading) {
    return <div className="animate-pulse h-8 w-8 rounded-full bg-gray-200" />;
  }

  if (!isAuthenticated) {
    return (
      <a
        href="/api/auth/login"
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Sign In
      </a>
    );
  }

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2"
      >
        {user?.picture ? (
          <img
            src={user.picture}
            alt={user.name || 'User'}
            className="h-8 w-8 rounded-full"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
            {user?.email?.[0].toUpperCase()}
          </div>
        )}
        <span className="text-sm font-medium">{user?.name || user?.email}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1">
          <div className="px-4 py-2 text-sm text-gray-500">
            {user?.email}
          </div>
          <hr />
          <a
            href="/settings/profile"
            className="block px-4 py-2 text-sm hover:bg-gray-100"
          >
            Settings
          </a>
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
```

### 3. Protected Route Component

Create a wrapper for pages that require authentication:

```tsx
// components/ProtectedRoute.tsx
'use client';

import { useAuth } from '@authvital/sdk/client';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Required permissions (user must have ALL) */
  permissions?: string[];
  /** Required roles (user must have ANY) */
  roles?: string[];
  /** Required license feature */
  licenseFeature?: string;
  /** Custom loading component */
  loadingComponent?: React.ReactNode;
  /** Custom forbidden component */
  forbiddenComponent?: React.ReactNode;
}

export function ProtectedRoute({
  children,
  permissions = [],
  roles = [],
  licenseFeature,
  loadingComponent,
  forbiddenComponent,
}: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Redirect to login with return URL
      router.push(`/api/auth/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isAuthenticated, router, pathname]);

  // Show loading state
  if (isLoading) {
    return loadingComponent || (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Not authenticated - will redirect
  if (!isAuthenticated) {
    return null;
  }

  // Check permissions
  if (permissions.length > 0) {
    const userPerms = user?.appPermissions || [];
    const hasAll = permissions.every(p => userPerms.includes(p));

    if (!hasAll) {
      return forbiddenComponent || (
        <ForbiddenPage
          message="You don't have the required permissions to access this page."
          required={permissions}
        />
      );
    }
  }

  // Check roles
  if (roles.length > 0) {
    const userRoles = user?.tenantRoles || [];
    const hasAny = roles.some(r => userRoles.includes(r));

    if (!hasAny) {
      return forbiddenComponent || (
        <ForbiddenPage
          message="You don't have the required role to access this page."
          required={roles}
        />
      );
    }
  }

  // Check license feature
  if (licenseFeature) {
    const features = user?.license?.features || [];

    if (!features.includes(licenseFeature)) {
      return forbiddenComponent || (
        <ForbiddenPage
          message="Your current license doesn't include this feature."
          required={[licenseFeature]}
          isLicenseError
        />
      );
    }
  }

  return <>{children}</>;
}

function ForbiddenPage({
  message,
  required,
  isLicenseError = false,
}: {
  message: string;
  required: string[];
  isLicenseError?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="text-6xl mb-4">🚫</div>
      <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
      <p className="text-gray-600 mb-4 text-center max-w-md">{message}</p>
      {isLicenseError ? (
        <a
          href="/settings/billing"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Upgrade Plan
        </a>
      ) : (
        <a
          href="/dashboard"
          className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
        >
          Go to Dashboard
        </a>
      )}
    </div>
  );
}
```

**Usage:**

```tsx
// app/admin/page.tsx
import { ProtectedRoute } from '@/components/ProtectedRoute';

export default function AdminPage() {
  return (
    <ProtectedRoute roles={['admin', 'super_admin']}>
      <div>
        <h1>Admin Dashboard</h1>
        {/* Admin content */}
      </div>
    </ProtectedRoute>
  );
}

// app/reports/advanced/page.tsx
import { ProtectedRoute } from '@/components/ProtectedRoute';

export default function AdvancedReportsPage() {
  return (
    <ProtectedRoute
      permissions={['reports:read']}
      licenseFeature="advanced_analytics"
    >
      <div>
        <h1>Advanced Reports</h1>
        {/* Premium content */}
      </div>
    </ProtectedRoute>
  );
}
```

---

## Testing Your Integration

### 1. Test Auth Flow

**Step-by-step verification:**

```bash
# 1. Start your dev server
npm run dev

# 2. Open browser to your app
open http://localhost:3000

# 3. Click "Sign In" or visit directly
open http://localhost:3000/api/auth/login

# 4. Login at AuthVital (you'll be redirected)
# 5. After login, you should be redirected to /dashboard
# 6. Verify user data is loaded
curl http://localhost:3000/api/auth/me -H "Cookie: access_token=..."
```

**Expected `/api/auth/me` response:**

```json
{
  "authenticated": true,
  "user": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "name": "Jane Smith",
    "tenantId": "tnt_xyz789",
    "tenantRoles": ["admin"],
    "appPermissions": ["users:read", "users:write"],
    "license": {
      "type": "pro",
      "features": ["advanced_analytics", "api_access"]
    }
  }
}
```

### 2. Test Webhooks (with ngrok)

To test webhooks locally, use ngrok to expose your local server:

```bash
# Install ngrok if needed
brew install ngrok  # or download from ngrok.com

# Start ngrok tunnel
ngrok http 3000

# You'll see something like:
# Forwarding: https://abc123.ngrok.io -> http://localhost:3000
```

**Update webhook URL in AuthVital:**

1. Go to **Settings** → **Webhooks**
2. Edit your webhook
3. Update URL to: `https://abc123.ngrok.io/webhooks/authvital`
4. Save

**Trigger a test event:**

1. In AuthVital dashboard, go to **Users**
2. Update a user's profile
3. Check your server logs for webhook receipt
4. Verify identity was updated in your database:

```bash
# Check database
npx prisma studio
# Look in av_identities table
```

### 3. Test Protected Routes

```bash
# Without auth - should return 401
curl http://localhost:3000/api/protected
# {"error":"Unauthorized","code":"UNAUTHORIZED"}

# With auth - should work
curl http://localhost:3000/api/protected \
  -H "Cookie: access_token=YOUR_TOKEN"
# {"data":...}

# With wrong permissions - should return 403
curl http://localhost:3000/api/admin/users \
  -H "Cookie: access_token=REGULAR_USER_TOKEN"
# {"error":"Forbidden","code":"MISSING_PERMISSIONS",...}
```

---

## Common Patterns

### 1. Org/Tenant Picker

For multi-tenant apps, let users switch between organizations:

```tsx
// components/TenantPicker.tsx
'use client';

import { useAuth } from '@authvital/sdk/client';
import { useState, useEffect } from 'react';

interface Tenant {
  id: string;
  name: string;
  subdomain: string;
}

export function TenantPicker() {
  const { user, isAuthenticated } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Fetch user's tenants from your backend
    fetch('/api/tenants/mine')
      .then(res => res.json())
      .then(data => {
        setTenants(data.tenants);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load tenants:', err);
        setIsLoading(false);
      });
  }, [isAuthenticated]);

  const switchTenant = async (tenantId: string) => {
    // Request new token scoped to this tenant
    // This typically involves re-authenticating with tenant_hint
    const tenant = tenants.find(t => t.id === tenantId);
    if (!tenant) return;

    // Redirect to login with tenant hint
    window.location.href = `/api/auth/login?tenant_hint=${tenant.subdomain}`;
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (tenants.length <= 1) {
    return null; // No picker needed for single tenant
  }

  const currentTenant = tenants.find(t => t.id === user?.tenantId);

  return (
    <select
      value={user?.tenantId || ''}
      onChange={(e) => switchTenant(e.target.value)}
      className="px-3 py-2 border rounded-lg"
    >
      {tenants.map(tenant => (
        <option key={tenant.id} value={tenant.id}>
          {tenant.name}
          {tenant.id === user?.tenantId && ' (current)'}
        </option>
      ))}
    </select>
  );
}
```

**Backend route to fetch user's tenants:**

```typescript
// routes/tenants.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { authvital } from '../lib/authvital';

const router = Router();

router.get('/mine', requireAuth, async (req, res) => {
  try {
    // listTenantsForUser with appendClientId automatically
    // filters to tenants where user has access to this app
    const tenants = await authvital.tenants.listForUser(req.user!.sub, {
      appendClientId: true,
    });

    res.json({ tenants });
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

export default router;
```

### 2. Permission-Based UI

Conditionally render UI based on permissions:

```tsx
// components/PermissionGate.tsx
'use client';

import { useAuth } from '@authvital/sdk/client';

interface PermissionGateProps {
  children: React.ReactNode;
  /** Required permissions (user must have ALL) */
  permissions?: string[];
  /** Required permissions (user must have ANY) */
  anyPermissions?: string[];
  /** Required roles (user must have ANY) */
  roles?: string[];
  /** What to render if check fails (default: nothing) */
  fallback?: React.ReactNode;
}

export function PermissionGate({
  children,
  permissions = [],
  anyPermissions = [],
  roles = [],
  fallback = null,
}: PermissionGateProps) {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <>{fallback}</>;
  }

  const userPerms = user?.appPermissions || [];
  const userRoles = user?.tenantRoles || [];

  // Check ALL required permissions
  if (permissions.length > 0) {
    const hasAll = permissions.every(p => userPerms.includes(p));
    if (!hasAll) return <>{fallback}</>;
  }

  // Check ANY required permissions
  if (anyPermissions.length > 0) {
    const hasAny = anyPermissions.some(p => userPerms.includes(p));
    if (!hasAny) return <>{fallback}</>;
  }

  // Check ANY required roles
  if (roles.length > 0) {
    const hasAny = roles.some(r => userRoles.includes(r));
    if (!hasAny) return <>{fallback}</>;
  }

  return <>{children}</>;
}
```

**Usage:**

```tsx
// components/Dashboard.tsx
import { PermissionGate } from './PermissionGate';

export function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>

      {/* Only admins see this */}
      <PermissionGate roles={['admin']}>
        <AdminPanel />
      </PermissionGate>

      {/* Only users with delete permission see this button */}
      <PermissionGate permissions={['posts:delete']}>
        <button className="text-red-600">Delete All Posts</button>
      </PermissionGate>

      {/* Show upgrade prompt for non-premium users */}
      <PermissionGate
        permissions={['premium_features']}
        fallback={
          <div className="p-4 bg-yellow-50 rounded">
            <p>Upgrade to Premium to unlock this feature!</p>
            <a href="/billing">Learn more</a>
          </div>
        }
      >
        <PremiumFeatures />
      </PermissionGate>
    </div>
  );
}
```

### 3. License-Gated Features

Check license features for premium functionality:

```tsx
// components/FeatureGate.tsx
'use client';

import { useAuth } from '@authvital/sdk/client';

interface FeatureGateProps {
  children: React.ReactNode;
  /** Required license feature */
  feature: string;
  /** Upgrade prompt to show when feature is locked */
  upgradePrompt?: React.ReactNode;
}

export function FeatureGate({
  children,
  feature,
  upgradePrompt,
}: FeatureGateProps) {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  const features = user?.license?.features || [];
  const hasFeature = features.includes(feature);

  if (!hasFeature) {
    return upgradePrompt || (
      <div className="relative">
        {/* Blurred preview of locked content */}
        <div className="blur-sm pointer-events-none opacity-50">
          {children}
        </div>
        {/* Upgrade overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
          <div className="text-center p-6">
            <div className="text-4xl mb-2">🔒</div>
            <h3 className="font-bold mb-2">Premium Feature</h3>
            <p className="text-gray-600 mb-4">
              Upgrade your plan to access {feature.replace(/_/g, ' ')}
            </p>
            <a
              href="/settings/billing"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Upgrade Now
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
```

**Usage:**

```tsx
// pages/reports.tsx
import { FeatureGate } from '@/components/FeatureGate';

export function ReportsPage() {
  return (
    <div>
      <h1>Reports</h1>

      {/* Basic reports - available to all */}
      <BasicReports />

      {/* Advanced analytics - requires license feature */}
      <FeatureGate feature="advanced_analytics">
        <AdvancedAnalytics />
      </FeatureGate>

      {/* Custom with specific upgrade prompt */}
      <FeatureGate
        feature="export_pdf"
        upgradePrompt={
          <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center">
            <p className="text-gray-500">PDF Export is a Pro feature</p>
            <a href="/billing" className="text-blue-600">Start free trial →</a>
          </div>
        }
      >
        <ExportPDFButton />
      </FeatureGate>
    </div>
  );
}
```

---

## Troubleshooting

### Common Issues & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| **"Missing tenant_id claim"** | Token is not tenant-scoped | User needs to select a tenant or use `tenant_hint` in OAuth flow |
| **"Invalid signature"** | Wrong JWKS endpoint | Verify `AV_HOST` is correct and accessible |
| **"CORS error on login"** | Redirect URI mismatch | Ensure redirect_uri matches exactly in AuthVital dashboard |
| **"State mismatch"** | Session lost during OAuth | Check session middleware is configured correctly |
| **Webhook signature invalid** | Raw body not preserved | Use `express.raw()` BEFORE any JSON parsing |
| **Identity not syncing** | Webhook not received | Check webhook URL is publicly accessible (use ngrok for local) |
| **"Unauthorized" on all requests** | Cookie not sent | Check `sameSite` and `secure` cookie settings |

### Debug Checklist

```bash
# 1. Verify environment variables
echo $AV_HOST
echo $AV_CLIENT_ID

# 2. Test AuthVital connectivity
curl $AV_HOST/.well-known/jwks.json

# 3. Check cookie is set after login
# In browser DevTools → Application → Cookies
# Look for 'access_token' cookie

# 4. Decode JWT to inspect claims
# Paste token at jwt.io to see claims

# 5. Check webhook delivery in AuthVital
# Dashboard → Settings → Webhooks → View Logs

# 6. Check server logs for errors
npm run dev 2>&1 | grep -i error
```

### Getting Help

- 📖 **Documentation**: [docs.authvital.com](https://docs.authvital.com)
- 💬 **Discord**: [discord.gg/authvital](https://discord.gg/authvital)
- 🐛 **Issues**: [github.com/authvital/sdk/issues](https://github.com/authvital/sdk/issues)
- 📧 **Support**: support@authvital.com

---

## Next Steps

Now that you have a complete integration, explore these topics:

| Guide | Description |
|-------|-------------|
| [Server SDK Reference](./server-sdk.md) | Deep dive into all server-side SDK methods |
| [Client SDK Reference](./client-sdk.md) | Complete React hooks and components documentation |
| [Webhooks Guide](./webhooks.md) | Advanced webhook handling and event types |
| [Identity Sync Guide](./user-sync.md) | Patterns for syncing and extending identities |
| [Multi-tenancy](../concepts/multi-tenancy.md) | Understanding tenant architecture |
| [Licensing](../concepts/licensing.md) | License types, features, and enforcement |
| [Access Control](../concepts/access-control.md) | Roles, permissions, and authorization |
| [Security Best Practices](../security/best-practices.md) | Production security checklist |

---

🎉 **Congratulations!** You now have a fully integrated AuthVital authentication system with:

- ✅ Secure OAuth 2.0 PKCE flow
- ✅ JWT-based authentication
- ✅ Permission and role-based access control
- ✅ Real-time identity sync via webhooks
- ✅ License-gated features
- ✅ Multi-tenant support

Happy building! 🚀
