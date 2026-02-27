# JWT Validation

> Extract, validate, and query user claims from incoming requests.

The SDK provides multiple methods for JWT validation, from soft checks to strict validation with guaranteed claims.

## getCurrentUser()

**Soft validation** - Returns a result object rather than throwing.

```typescript
import { createAuthVital } from '@authvital/sdk/server';

const authvital = createAuthVital({ /* config */ });

app.get('/api/me', async (req, res) => {
  const { authenticated, user, error } = await authvital.getCurrentUser(req);
  
  if (!authenticated) {
    return res.status(401).json({ error: error || 'Unauthorized' });
  }
  
  // User object contains all JWT claims
  res.json({
    id: user.sub,
    email: user.email,
    name: `${user.given_name} ${user.family_name}`,
    tenant: user.tenant_id,
    roles: user.app_roles,
  });
});
```

### Return Type

```typescript
interface GetCurrentUserResult {
  authenticated: boolean;
  user: EnhancedJwtPayload | null;
  error?: string;
}
```

---

## validateRequest()

**Strict validation** - Throws if not authenticated or missing required claims.

!!! warning "Throws on failure"
    Unlike `getCurrentUser()`, this method **throws** if validation fails. Use try/catch.

```typescript
interface ValidatedClaims {
  sub: string;              // User ID - always present
  tenantId: string;         // Tenant ID - REQUIRED, throws if missing!
  tenantSubdomain?: string; // Tenant subdomain (if available)
  email?: string;           // User's email
  tenant_roles?: string[];  // Tenant-level roles
  payload: JwtPayload;      // Full JWT payload for advanced use
}
```

### Usage Example

```typescript
app.get('/api/tenant-data', async (req, res) => {
  try {
    // This THROWS if not authenticated or missing tenant_id
    const claims = await authvital.validateRequest(req);
    
    // claims.tenantId is guaranteed to exist here!
    console.log('User:', claims.sub);
    console.log('Tenant:', claims.tenantId);
    console.log('Email:', claims.email);
    
    // Access full JWT if needed
    console.log('License:', claims.payload.license);
    
    const data = await fetchTenantData(claims.tenantId);
    res.json(data);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});
```

### Error Messages

| Error | Cause |
|-------|-------|
| `No authentication token found` | Missing Bearer token or auth cookie |
| `Invalid or expired token` | JWT signature invalid or expired |
| `Token missing required tenant_id claim` | User not scoped to a tenant |

### When to Use Which

| Method | Use Case |
|--------|----------|
| `getCurrentUser()` | Soft check, custom error handling, optional auth |
| `validateRequest()` | Strict check, guaranteed claims, tenant-required endpoints |

---

## Token Extraction

The SDK automatically extracts JWTs from:

1. `Authorization: Bearer <token>` header
2. `access_token` cookie
3. `auth_token` cookie

```typescript
// All of these work:
fetch('/api/me', {
  headers: { 'Authorization': 'Bearer eyJ...' }
});

// Or with cookies (set by AuthVital login)
fetch('/api/me', {
  credentials: 'include'
});
```

---

## JWT Claims Structure

```typescript
interface EnhancedJwtPayload {
  // Identity
  sub: string;              // User ID
  email: string;
  given_name: string;
  family_name: string;
  picture?: string;
  
  // Tenant (if scoped)
  tenant_id?: string;
  tenant_slug?: string;
  
  // Authorization
  tenant_roles?: string[];   // ['owner', 'admin', 'member']
  tenant_permissions?: string[]; // ['members:invite', 'billing:manage']
  app_roles?: string[];      // ['admin', 'editor']
  app_permissions?: string[]; // ['projects:create', 'reports:view']
  
  // License
  license?: {
    type: string;           // 'pro'
    name: string;           // 'Pro Plan'
    features: string[];     // ['sso', 'api-access']
  };
  
  // Standard JWT claims
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
}
```

---

## Permission Helpers

!!! success "Zero API Calls"
    All permission helpers read directly from JWT claims - no network requests!

### hasTenantPermission()

Check tenant-level permissions (from IDP tenant roles). Supports wildcards!

```typescript
// Exact permission check
if (await authvital.hasTenantPermission(req, 'members:invite')) {
  // User can invite members to the tenant
}

// Wildcard matching
if (await authvital.hasTenantPermission(req, 'licenses:*')) {
  // User has some license permission (licenses:view, licenses:manage, etc.)
}
```

**Wildcard Rules:**

- `licenses:*` matches `licenses:view`, `licenses:manage`, `licenses:assign`
- `*:manage` matches `billing:manage`, `members:manage`, etc.
- Exact match is tried first, then wildcard expansion

### hasAppPermission()

Check application-level permissions (from your app's custom roles).

```typescript
if (await authvital.hasAppPermission(req, 'projects:create')) {
  // User can create projects in your app
}

// Also supports wildcards
if (await authvital.hasAppPermission(req, 'admin:*')) {
  // User has some admin permission
}
```

**Tenant vs App Permissions:**

| Type | Source | Examples |
|------|--------|----------|
| Tenant Permissions | IDP tenant roles (owner, admin, member) | `members:invite`, `billing:manage` |
| App Permissions | Your app's custom roles | `projects:create`, `reports:export` |

### hasFeatureFromJwt()

Check if the tenant's license includes a specific feature.

```typescript
if (await authvital.hasFeatureFromJwt(req, 'sso')) {
  // Show SSO configuration options
}

// Feature gating example
if (await authvital.hasFeatureFromJwt(req, 'advanced-analytics')) {
  return renderAdvancedDashboard();
} else {
  return renderBasicDashboard();
}
```

### getLicenseTypeFromJwt()

Get the license type slug directly from the JWT.

```typescript
const licenseType = await authvital.getLicenseTypeFromJwt(req);

switch (licenseType) {
  case 'enterprise':
    // Full feature access
    break;
  case 'pro':
    // Pro features only
    break;
  default:
    // Basic features
    break;
}
```

### Bulk Getters

Get all permissions/roles at once:

```typescript
// All tenant permissions
const tenantPermissions = await authvital.getTenantPermissions(req);
// ['members:invite', 'members:remove', 'settings:view', ...]

// All app permissions
const appPermissions = await authvital.getAppPermissions(req);
// ['projects:create', 'projects:delete', 'reports:view', ...]

// Tenant roles
const tenantRoles = await authvital.getTenantRoles(req);
// ['owner'] or ['admin'] or ['member']

// App roles
const appRoles = await authvital.getAppRoles(req);
// ['editor', 'viewer']
```

---

## Management URLs

Generate URLs to AuthVital management pages:

### getManagementUrls()

```typescript
const urls = await authvital.getManagementUrls(req);

console.log(urls);
// {
//   overview: 'https://auth.example.com/tenant/abc/overview',
//   members: 'https://auth.example.com/tenant/abc/members',
//   applications: 'https://auth.example.com/tenant/abc/applications',
//   settings: 'https://auth.example.com/tenant/abc/settings',
//   accountSettings: 'https://auth.example.com/account/settings',
// }
```

### Individual URL Methods

```typescript
// Tenant-scoped URLs (require req for tenant context)
const membersUrl = await authvital.getMembersUrl(req);
const applicationsUrl = await authvital.getApplicationsUrl(req);
const settingsUrl = await authvital.getSettingsUrl(req);
const overviewUrl = await authvital.getOverviewUrl(req);

// Account settings URL (no req needed - user-specific)
const accountUrl = authvital.getAccountSettingsUrl();
```

---

## Complete Example

```typescript
app.get('/api/analytics/advanced', async (req, res) => {
  // 1. Validate authentication (throws if invalid)
  const claims = await authvital.validateRequest(req);
  
  // 2. Check license feature (no API call!)
  if (!await authvital.hasFeatureFromJwt(req, 'advanced-analytics')) {
    return res.status(402).json({
      error: 'Feature requires Pro license',
      feature: 'advanced-analytics',
      upgradeUrl: await authvital.getSettingsUrl(req),
    });
  }
  
  // 3. Check permission (no API call!)
  if (!await authvital.hasAppPermission(req, 'analytics:view')) {
    return res.status(403).json({
      error: 'Missing permission: analytics:view',
    });
  }
  
  // 4. All checks passed!
  const data = await fetchAdvancedAnalytics(claims.tenantId);
  res.json(data);
});
```
