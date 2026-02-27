# Common Patterns

> Reusable middleware and patterns for authentication, permissions, and licensing.

---

## Express Middleware

### Basic Auth Middleware

```typescript
// middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { authvital } from '../lib/authvital';

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        email?: string;
        tenant_id?: string;
        tenant_roles?: string[];
        app_permissions?: string[];
        license?: { type: string; features: string[] };
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

  req.user = user;
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

## Using SDK Permission Helpers

The SDK provides zero-API-call permission checks that read from the JWT:

```typescript
// Check tenant permission (supports wildcards!)
if (await authvital.hasTenantPermission(req, 'members:invite')) {
  // User can invite members
}

// Wildcard matching
if (await authvital.hasTenantPermission(req, 'licenses:*')) {
  // User has any license permission
}

// Check app permission
if (await authvital.hasAppPermission(req, 'projects:create')) {
  // User can create projects
}

// Check license feature from JWT
if (await authvital.hasFeatureFromJwt(req, 'sso')) {
  // Tenant has SSO enabled
}

// Get license type
const licenseType = await authvital.getLicenseTypeFromJwt(req);
if (licenseType === 'enterprise') {
  // Show enterprise features
}
```

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

### Using validateRequest for Guaranteed Tenant

```typescript
router.get('/api/members', async (req, res) => {
  try {
    // This THROWS if not authenticated or missing tenant_id
    const claims = await authvital.validateRequest(req);
    
    // claims.tenantId is guaranteed to exist here
    const members = await authvital.memberships.listForTenant(req);
    res.json(members);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
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
