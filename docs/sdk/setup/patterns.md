# Common Patterns

> Reusable middleware and patterns for authentication, permissions, and licensing.

---

## Express Middleware

### Basic Auth Middleware

!!! note "This builds your own guard on top of the real `verifyToken`"
    There is no `authvital.getCurrentUser(req)` returning
    `{ authenticated, user, error }`. The real primitive is `verifyToken()`
    (re-exported from `@authvital/server`). If you use the session middleware
    (`authVitalMiddleware` + `requireAuth()` from `@authvital/server/middleware`),
    the token is on `req.authVital.accessToken`. Below we verify it ourselves and
    stash the decoded claims on `req.user`.

```typescript
// middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@authvital/server';
import type { EnhancedJwtPayload } from '@authvital/shared';

declare global {
  namespace Express {
    interface Request {
      // Verified JWT claims (see server-sdk/jwt-validation.md)
      user?: EnhancedJwtPayload;
    }
  }
}

/**
 * Require an authenticated user.
 *
 * Grab the access token however your app stores it (a cookie set at login, the
 * `Authorization: Bearer` header, or `req.authVital.accessToken` if you use the
 * session middleware), then verify it cryptographically against the JWKS.
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token =
    req.cookies?.access_token ??
    req.headers.authorization?.replace(/^Bearer /, '');

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }

  const result = await verifyToken(token, {
    jwksUri: `${process.env.AV_HOST}/.well-known/jwks.json`,
    issuer: process.env.AV_HOST,
    audience: process.env.AV_CLIENT_ID,
  });

  if (!result.valid) {
    return res.status(401).json({ error: result.error, code: 'UNAUTHORIZED' });
  }

  req.user = result.payload as EnhancedJwtPayload;
  next();
};
```

### Permission Middleware

```typescript
/**
 * Require ALL listed permissions
 */
export const requirePermission = (...permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userPermissions = req.user.app_permissions || [];
    const hasAll = permissions.every(p => userPermissions.includes(p));

    if (!hasAll) {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'MISSING_PERMISSIONS',
        required: permissions,
        missing: permissions.filter(p => !userPermissions.includes(p)),
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
      return res.status(401).json({ error: 'Unauthorized' });
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
```

### Role Middleware

```typescript
/**
 * Require any of the listed tenant roles
 */
export const requireTenantRole = (...roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
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
```

### License Feature Middleware

```typescript
/**
 * Require a specific license feature
 */
export const requireLicenseFeature = (feature: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
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

### Usage Examples

```typescript
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
  (req, res) => res.json({ users: [] })
);

// Require multiple permissions
router.delete(
  '/admin/users/:id',
  requireAuth,
  requirePermission('users:read', 'users:delete'),
  (req, res) => res.json({ deleted: true })
);

// Require tenant admin role
router.get(
  '/settings/billing',
  requireAuth,
  requireTenantRole('admin', 'billing_admin'),
  (req, res) => res.json({ billing: {} })
);

// Require license feature
router.get(
  '/reports/advanced',
  requireAuth,
  requireLicenseFeature('advanced_analytics'),
  (req, res) => res.json({ report: {} })
);
```

---

## Claim-Based Permission Checks (write these yourself)

!!! warning "There are no `authvital.hasTenantPermission(req, …)` / `hasAppPermission` / `hasFeatureFromJwt` / `getLicenseTypeFromJwt` methods"
    The SDK does **not** ship request-scoped, wildcard-aware permission helpers.
    These are one-liners you write against the verified claims on `req.user`
    (see [JWT Validation](../server-sdk/jwt-validation.md)). For an authoritative,
    live check that isn't bound to a token snapshot, call the M2M integration
    client instead: `client.integration.checkPermission(...)` / `checkFeature(...)`.

```typescript
import type { EnhancedJwtPayload } from '@authvital/shared';

// Plain includes() checks against the verified claims (req.user).
const can = (claims: EnhancedJwtPayload | undefined, perm: string) =>
  Boolean(claims?.tenant_permissions?.includes(perm));

if (can(req.user, 'members:invite')) {
  // User can invite members
}

// App permission
if (req.user?.app_permissions?.includes('projects:create')) {
  // User can create projects
}

// License feature from JWT
if (req.user?.license?.features?.includes('sso')) {
  // Tenant has SSO enabled
}

// License type
if (req.user?.license?.type === 'enterprise') {
  // Show enterprise features
}
```

> Want wildcard matching (`licenses:*`)? That's your own helper too — e.g. match
> the prefix before `:` against the claim array. The SDK doesn't do it for you.
>
> Need a real-time check that ignores what's baked into the current token? Use
> `client.integration.checkPermission({ userId, tenantId, permission })`.

---

## Multi-Tenant Patterns

### Tenant Context from JWT

```typescript
router.get('/api/data', requireAuth, async (req, res) => {
  // Get tenant from validated JWT
  const tenantId = req.user?.tenant_id;
  
  if (!tenantId) {
    return res.status(400).json({ error: 'No tenant context' });
  }
  
  // Query data scoped to tenant
  const data = await prisma.item.findMany({
    where: { tenantId },
  });
  
  res.json(data);
});
```

### Requiring a Tenant Context

!!! warning "No `authvital.validateRequest(req)` and no `authvital.memberships.listForTenant(req)`"
    Both are fictional. Verify the token yourself (or reuse `requireAuth` above),
    read `tenant_id` from the claims, then list members via the **M2M integration
    client**: `client.integration.listTenantMembers({ tenantId })`.

```typescript
import { createServerClient } from '@authvital/server';

const client = createServerClient({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
});

// requireAuth has already verified the token and populated req.user.
router.get('/api/members', requireAuth, async (req, res) => {
  const tenantId = req.user?.tenant_id;
  if (!tenantId) {
    return res.status(400).json({ error: 'No tenant context in token' });
  }

  const { memberships } = await client.integration.listTenantMembers({
    tenantId,
    includeRoles: true,
  });
  res.json(memberships);
});
```

---

## Next.js Middleware

For route protection at the edge:

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const protectedRoutes = ['/dashboard', '/settings', '/admin'];
const authRoutes = ['/login', '/signup'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('access_token')?.value;

  const isProtectedRoute = protectedRoutes.some(r => pathname.startsWith(r));
  const isAuthRoute = authRoutes.some(r => pathname.startsWith(r));

  // Basic token presence check (full verification in API routes)
  const isAuthenticated = !!token && token.split('.').length === 3;

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
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

---

## Error Handling

### Structured Error Responses

```typescript
interface ApiError {
  error: string;
  code: string;
  details?: Record<string, any>;
}

function sendError(res: Response, status: number, error: ApiError) {
  return res.status(status).json(error);
}

// Usage
if (!hasPermission) {
  return sendError(res, 403, {
    error: 'You do not have permission to perform this action',
    code: 'FORBIDDEN',
    details: {
      required: ['users:delete'],
      current: userPermissions,
    },
  });
}
```

---

## See Also

- [Server SDK Namespaces](../server-sdk/namespaces/overview.md) - Full namespace reference
- [JWT Claims Reference](../../reference/jwt-claims.md) - Available JWT claims
- [Security Best Practices](../../security/best-practices/index.md) - Security recommendations
