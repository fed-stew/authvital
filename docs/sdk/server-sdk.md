# Server SDK Guide

> Complete reference for integrating AuthVader into your Node.js backend.

## Installation

```bash
npm install @authvader/sdk
```

## Quick Setup

```typescript
import { createAuthVader } from '@authvader/sdk/server';

const authvader = createAuthVader({
  authVaderHost: process.env.AUTHVADER_HOST!,
  clientId: process.env.AUTHVADER_CLIENT_ID!,
  clientSecret: process.env.AUTHVADER_CLIENT_SECRET!,
});
```

## Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `authVaderHost` | `string` | Yes | AuthVader server URL |
| `clientId` | `string` | Yes | OAuth client ID |
| `clientSecret` | `string` | Yes | OAuth client secret |
| `scope` | `string` | No | Default scopes (default: `system:admin`) |

## JWT Validation

### getCurrentUser()

Extracts and validates the JWT from an incoming request. This is a **soft validation** - it returns a result object rather than throwing.

```typescript
import { createAuthVader } from '@authvader/sdk/server';
import { Request, Response, NextFunction } from 'express';

const authvader = createAuthVader({ /* config */ });

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const { authenticated, user, error } = await authvader.getCurrentUser(req);
  
  if (!authenticated) {
    return res.status(401).json({ error: error || 'Unauthorized' });
  }
  
  // User object contains all JWT claims
  req.user = user;
  next();
}
```

### validateRequest()

> **Strict validation with guaranteed claims** - throws if not authenticated!

Unlike `getCurrentUser()`, this method **throws** if the user is not authenticated or if required claims (like `tenant_id`) are missing. Use this when you need guaranteed access to key claims.

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

**Usage Example:**

```typescript
app.get('/api/members', async (req, res) => {
  try {
    // This THROWS if not authenticated or missing tenant_id
    const claims = await authvader.validateRequest(req);
    
    // claims.tenantId is guaranteed to exist here!
    console.log('User:', claims.sub);
    console.log('Tenant:', claims.tenantId);
    console.log('Email:', claims.email);
    
    // Access full JWT if needed
    console.log('License:', claims.payload.license);
    
    const members = await authvader.memberships.listForTenant(req);
    res.json(members);
  } catch (error) {
    // AuthVaderError with descriptive message
    res.status(401).json({ error: error.message });
  }
});
```

**Error Messages:**

| Error | Cause |
|-------|-------|
| `No authentication token found` | Missing Bearer token or auth cookie |
| `Invalid or expired token` | JWT signature invalid or expired |
| `Token missing required tenant_id claim` | User not scoped to a tenant |

**When to use which:**

| Method | Use Case |
|--------|----------|
| `getCurrentUser()` | Soft check, custom error handling, optional auth |
| `validateRequest()` | Strict check, guaranteed claims, tenant-required endpoints |

**User Object Properties:**

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
  app_roles: string[];      // ["admin", "member"]
  app_permissions: string[]; // ["users:read", "users:write"]
  
  // License
  license?: {
    type: string;           // "pro"
    name: string;           // "Pro Plan"
    features: string[];     // ["sso", "api-access"]
  };
  
  // Standard JWT claims
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
}
```

### Token Extraction

The SDK automatically extracts JWTs from:

1. `Authorization: Bearer <token>` header
2. `access_token` cookie
3. `auth_token` cookie

```typescript
// All of these work:
fetch('/api/me', {
  headers: { 'Authorization': 'Bearer eyJ...' }
});

// Or with cookies (set by AuthVader login)
fetch('/api/me', {
  credentials: 'include'
});
```

## JWT Permission Helpers

> **⚡ ZERO API CALLS** - All these methods read directly from JWT claims!

These helper methods provide instant permission/feature checks by reading the claims embedded in the JWT. They're blazing fast since they don't make any network requests.

### Permission Checks

#### hasTenantPermission()

Check if the user has a specific tenant-level permission. Supports wildcard matching!

```typescript
// Exact permission check
if (await authvader.hasTenantPermission(req, 'members:invite')) {
  // User can invite members to the tenant
}

// Wildcard matching - checks if user has ANY license permission
if (await authvader.hasTenantPermission(req, 'licenses:*')) {
  // User has some license permission (licenses:view, licenses:manage, etc.)
}

// Common patterns
await authvader.hasTenantPermission(req, 'billing:manage');    // Can manage billing
await authvader.hasTenantPermission(req, 'settings:*');        // Any settings access
await authvader.hasTenantPermission(req, 'members:remove');    // Can remove members
```

**Wildcard Rules:**
- `licenses:*` matches `licenses:view`, `licenses:manage`, `licenses:assign`, etc.
- `*:manage` matches `billing:manage`, `members:manage`, etc.
- Exact match is tried first, then wildcard expansion

#### hasAppPermission()

Check if the user has a specific application-level permission.

```typescript
// Check app-specific permissions (defined in your application roles)
if (await authvader.hasAppPermission(req, 'projects:create')) {
  // User can create projects in your app
}

if (await authvader.hasAppPermission(req, 'reports:export')) {
  // User can export reports
}

// Also supports wildcards
if (await authvader.hasAppPermission(req, 'admin:*')) {
  // User has some admin permission
}
```

**Tenant vs App Permissions:**

| Type | Source | Examples |
|------|--------|----------|
| Tenant Permissions | IDP tenant roles (owner, admin, member) | `members:invite`, `billing:manage` |
| App Permissions | Your app's custom roles | `projects:create`, `reports:export` |

### Feature Checks

#### hasFeatureFromJwt()

Check if the tenant's license includes a specific feature - directly from the JWT!

```typescript
// Check for SSO feature
if (await authvader.hasFeatureFromJwt(req, 'sso')) {
  // Show SSO configuration options
}

// Feature gating example
if (await authvader.hasFeatureFromJwt(req, 'advanced-analytics')) {
  return renderAdvancedDashboard();
} else {
  return renderBasicDashboard();
}

// Multiple feature checks
const hasSso = await authvader.hasFeatureFromJwt(req, 'sso');
const hasApi = await authvader.hasFeatureFromJwt(req, 'api-access');
const hasAudit = await authvader.hasFeatureFromJwt(req, 'audit-logs');
```

#### getLicenseTypeFromJwt()

Get the user's license type directly from the JWT.

```typescript
const licenseType = await authvader.getLicenseTypeFromJwt(req);

switch (licenseType) {
  case 'enterprise':
    // Full feature access
    break;
  case 'pro':
    // Pro features only
    break;
  case 'free':
  default:
    // Basic features
    break;
}

// Conditional rendering
if (licenseType === 'enterprise') {
  showEnterpriseOnboarding();
}
```

**Return Values:**

| Value | Meaning |
|-------|--------|
| `'enterprise'`, `'pro'`, etc. | License type slug |
| `undefined` | No license in JWT (user may not have a license) |

### Bulk Getters

Get all permissions/roles at once for complex authorization logic.

#### getTenantPermissions()

```typescript
const tenantPermissions = await authvader.getTenantPermissions(req);
// Returns: ['members:invite', 'members:remove', 'settings:view', ...]

// Use for custom permission logic
const canManageAnything = tenantPermissions.some(p => p.endsWith(':manage'));
```

#### getAppPermissions()

```typescript
const appPermissions = await authvader.getAppPermissions(req);
// Returns: ['projects:create', 'projects:delete', 'reports:view', ...]

// Build a permission map for the frontend
res.json({
  user: claims.sub,
  permissions: appPermissions,
});
```

#### getTenantRoles()

```typescript
const tenantRoles = await authvader.getTenantRoles(req);
// Returns: ['owner'] or ['admin'] or ['member']

// Check role hierarchy
const isOwnerOrAdmin = tenantRoles.some(r => ['owner', 'admin'].includes(r));
```

#### getAppRoles()

```typescript
const appRoles = await authvader.getAppRoles(req);
// Returns: ['editor', 'viewer'] - your app's custom roles

// Role-based logic
if (appRoles.includes('editor')) {
  enableEditMode();
}
```

### Complete Example: Feature-Gated Endpoint

```typescript
app.get('/api/analytics/advanced', async (req, res) => {
  // 1. Validate authentication (throws if invalid)
  const claims = await authvader.validateRequest(req);
  
  // 2. Check license feature (no API call!)
  if (!await authvader.hasFeatureFromJwt(req, 'advanced-analytics')) {
    return res.status(402).json({
      error: 'Feature requires Pro license',
      feature: 'advanced-analytics',
      upgradeUrl: await authvader.getSettingsUrl(req),
    });
  }
  
  // 3. Check permission (no API call!)
  if (!await authvader.hasAppPermission(req, 'analytics:view')) {
    return res.status(403).json({
      error: 'Missing permission: analytics:view',
    });
  }
  
  // 4. All checks passed!
  const data = await fetchAdvancedAnalytics(claims.tenantId);
  res.json(data);
});
```

## Management URLs

Generate URLs to AuthVader management pages for your users.

### getManagementUrls()

Get all management URLs at once - perfect for building navigation!

```typescript
const urls = await authvader.getManagementUrls(req);

console.log(urls);
// {
//   overview: 'https://auth.example.com/tenant/abc/overview',
//   members: 'https://auth.example.com/tenant/abc/members',
//   applications: 'https://auth.example.com/tenant/abc/applications',
//   settings: 'https://auth.example.com/tenant/abc/settings',
//   accountSettings: 'https://auth.example.com/account/settings',
// }

// Use in your app's navigation
return (
  <nav>
    <a href={urls.members}>Team Members</a>
    <a href={urls.settings}>Tenant Settings</a>
    <a href={urls.accountSettings}>My Account</a>
  </nav>
);
```

**Return Type:**

```typescript
interface ManagementUrls {
  overview: string;        // Tenant dashboard
  members: string;         // Team member management
  applications: string;    // Connected applications
  settings: string;        // Tenant settings
  accountSettings: string; // User's personal account settings
}
```

### Individual URL Methods

For when you only need one URL:

```typescript
// Tenant-scoped URLs (require req for tenant context)
const membersUrl = await authvader.getMembersUrl(req);
const applicationsUrl = await authvader.getApplicationsUrl(req);
const settingsUrl = await authvader.getSettingsUrl(req);
const overviewUrl = await authvader.getOverviewUrl(req);

// Account settings URL (no req needed - it's user-specific!)
const accountUrl = authvader.getAccountSettingsUrl();
```

**Why getAccountSettingsUrl() doesn't need req:**

The account settings URL is the same for all users (`/account/settings`) - it doesn't depend on tenant context. The user's identity is determined by their session when they visit the page.

### Use Case: Settings Dropdown

```typescript
app.get('/api/navigation', async (req, res) => {
  const claims = await authvader.validateRequest(req);
  const urls = await authvader.getManagementUrls(req);
  const tenantRoles = await authvader.getTenantRoles(req);
  
  const nav = {
    account: {
      label: 'My Account',
      url: urls.accountSettings,
    },
  };
  
  // Only show tenant management to admins+
  if (tenantRoles.some(r => ['owner', 'admin'].includes(r))) {
    nav.tenant = {
      label: 'Manage Team',
      items: [
        { label: 'Members', url: urls.members },
        { label: 'Settings', url: urls.settings },
      ],
    };
  }
  
  res.json(nav);
});
```

## Middleware Factories

> Pre-built middleware for Express and Passport.js integration

### Express JWT Middleware

Create a ready-to-use Express middleware that validates JWTs and attaches the payload to `req.user`.

```typescript
import { createJwtMiddleware } from '@authvader/sdk/server';

const requireAuth = createJwtMiddleware({
  authVaderHost: process.env.AV_HOST!,
  audience: 'my-client-id', // Optional but recommended for extra validation
});

// Use as middleware
app.get('/api/protected', requireAuth, (req, res) => {
  // req.user contains the full JWT payload
  console.log('User ID:', req.user.sub);
  console.log('Tenant:', req.user.tenant_id);
  console.log('Roles:', req.user.app_roles);
  
  res.json({ message: `Hello, ${req.user.email}!` });
});

// Apply to entire router
const apiRouter = express.Router();
apiRouter.use(requireAuth);
apiRouter.get('/me', (req, res) => res.json(req.user));
apiRouter.get('/settings', (req, res) => { /* ... */ });
```

**Configuration Options:**

```typescript
interface JwtMiddlewareOptions {
  authVaderHost: string;    // Required: AuthVader server URL
  audience?: string;        // Optional: Expected JWT audience (client ID)
  issuer?: string;          // Optional: Override expected issuer
  algorithms?: string[];    // Optional: Allowed algorithms (default: RS256)
}
```

**Error Responses:**

The middleware returns appropriate HTTP errors:

| Status | Error | Cause |
|--------|-------|-------|
| 401 | `No token provided` | Missing Authorization header/cookie |
| 401 | `Token expired` | JWT `exp` claim in the past |
| 401 | `Invalid token` | Bad signature, malformed JWT |
| 401 | `Invalid audience` | Token audience doesn't match |

### Passport.js Integration

For apps using Passport.js, get pre-configured JWT strategy options.

```typescript
import passport from 'passport';
import { Strategy as JwtStrategy } from 'passport-jwt';
import { createPassportJwtOptions } from '@authvader/sdk/server';

// Get options (fetches JWKS automatically)
const jwtOptions = await createPassportJwtOptions({
  authVaderHost: process.env.AV_HOST!,
  audience: 'my-client-id',
});

// Configure Passport
passport.use(new JwtStrategy(jwtOptions, (payload, done) => {
  // payload contains the full JWT claims
  // Optionally enrich with database lookup
  // User.findById(payload.sub).then(user => done(null, user || payload));
  
  done(null, payload);
}));

// Use in routes
app.get('/api/protected',
  passport.authenticate('jwt', { session: false }),
  (req, res) => {
    res.json({ user: req.user });
  }
);
```

**What createPassportJwtOptions() returns:**

```typescript
interface PassportJwtOptions {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken();
  secretOrKeyProvider: (req, token, done) => Promise<void>;
  audience?: string;
  issuer: string;
  algorithms: ['RS256'];
}
```

**Note:** The `secretOrKeyProvider` automatically fetches and caches the JWKS from AuthVader for signature verification.

### Combining with Permission Helpers

```typescript
import { createJwtMiddleware } from '@authvader/sdk/server';

const requireAuth = createJwtMiddleware({
  authVaderHost: process.env.AV_HOST!,
});

// Create a permission-checking middleware factory
const requireAppPermission = (permission: string) => {
  return async (req, res, next) => {
    if (!await authvader.hasAppPermission(req, permission)) {
      return res.status(403).json({
        error: 'Forbidden',
        required: permission,
      });
    }
    next();
  };
};

// Stack middlewares
app.delete('/api/projects/:id',
  requireAuth,
  requireAppPermission('projects:delete'),
  async (req, res) => {
    await deleteProject(req.params.id);
    res.json({ deleted: true });
  }
);
```

## Namespaces

The SDK provides namespaced methods for different operations:

### Invitations

```typescript
// Send an invitation
await authvader.invitations.send({
  email: 'newuser@example.com',
  tenantId: 'tenant-123',
  roleId: 'role-member',        // Optional: default tenant role
  applicationRoleId: 'app-role', // Optional: app-specific role
  expiresInDays: 7,             // Optional: default 7
});

// List pending invitations for a tenant
const pending = await authvader.invitations.listPending('tenant-123');
// Returns: [{ id, email, status, expiresAt, invitedBy, ... }]

// Revoke an invitation
await authvader.invitations.revoke('invitation-id');
```

### Memberships

#### listForTenant()

List all members of a tenant with their roles and details.

```typescript
// Basic usage
const { memberships } = await authvader.memberships.listForTenant(req);
// Uses tenant from JWT automatically!

// With explicit tenant ID
const { memberships } = await authvader.memberships.listForTenant(req, {
  tenantId: 'tenant-123',
  status: 'ACTIVE', // or 'PENDING', 'SUSPENDED', 'ALL'
});
```

**Return Type:**

```typescript
interface MembershipListResponse {
  memberships: Array<{
    user: {
      id: string;
      email: string;
      givenName?: string;
      familyName?: string;
      picture?: string;
    };
    membership: {
      id: string;
      status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
      joinedAt: string;
    };
    roles: Array<{
      slug: string;
      name: string;
      type: 'tenant' | 'application';
    }>;
  }>;
  pagination?: {
    total: number;
    page: number;
    limit: number;
  };
}
```

#### listTenantsForUser() with appendClientId

Get all tenants a user belongs to - perfect for building an **org picker**!

```typescript
// Basic usage
const { tenants } = await authvader.memberships.listTenantsForUser(req);

// With OAuth redirect URLs ready
const { tenants } = await authvader.memberships.listTenantsForUser(req, {
  status: 'ACTIVE',
  appendClientId: true, // 🔥 Magic sauce!
});

// Each tenant now has a ready-to-use login URL:
tenants.forEach(tenant => {
  console.log(tenant.name, tenant.initiateLoginUri);
  // "Acme Corp" "https://acme.auth.example.com/login?client_id=your-client-id"
});
```

**Return Type:**

```typescript
interface TenantsForUserResponse {
  tenants: Array<{
    id: string;
    name: string;
    slug: string;
    subdomain: string;
    role: string;              // 'owner', 'admin', 'member'
    initiateLoginUri: string;  // Login URL (with client_id if appendClientId=true)
    memberSince: string;
    logoUrl?: string;
  }>;
}
```

**Use Case: Org Picker Component**

```typescript
app.get('/api/my-organizations', async (req, res) => {
  const { tenants } = await authvader.memberships.listTenantsForUser(req, {
    appendClientId: true,
  });
  
  res.json({
    organizations: tenants.map(t => ({
      id: t.id,
      name: t.name,
      logo: t.logoUrl,
      switchUrl: t.initiateLoginUri, // Click to switch!
      role: t.role,
    })),
  });
});
```

#### listForApplication()

Get members who have access to YOUR specific app (not just any tenant member).

```typescript
const { memberships } = await authvader.memberships.listForApplication(req, {
  status: 'ACTIVE',
  appendClientId: true,
});

// Only returns members with an application membership to your app
memberships.forEach(m => {
  console.log(m.user.email, m.roles);
});
```

**When to use which:**

| Method | Returns | Use Case |
|--------|---------|----------|
| `listForTenant()` | All tenant members | Admin panel showing all team members |
| `listForApplication()` | Only users with app access | Your app's user list |

#### getTenantRoles() vs getApplicationRoles()

**Tenant Roles** are IDP-level roles (owner, admin, member) - they control what users can do in the AuthVader tenant management UI.

```typescript
const { roles } = await authvader.memberships.getTenantRoles();

console.log(roles);
// [
//   { slug: 'owner', name: 'Owner', permissions: ['*'] },
//   { slug: 'admin', name: 'Admin', permissions: ['members:invite', 'members:remove', ...] },
//   { slug: 'member', name: 'Member', permissions: ['profile:view'] },
// ]
```

**Application Roles** are YOUR app's custom roles - they control what users can do in YOUR application.

```typescript
const { roles } = await authvader.memberships.getApplicationRoles();
// Uses clientId from SDK config automatically!

console.log(roles);
// [
//   { slug: 'admin', name: 'Admin', permissions: ['*'] },
//   { slug: 'editor', name: 'Editor', permissions: ['projects:create', 'projects:edit'] },
//   { slug: 'viewer', name: 'Viewer', permissions: ['projects:view'] },
// ]
```

**Role Hierarchy:**

```
Tenant Roles (IDP):        owner > admin > member
Application Roles (Your App): Defined by you!
```

#### setMemberRole() with Pre-flight Checks

Change a member's tenant role with **built-in permission validation**!

```typescript
const result = await authvader.memberships.setMemberRole(
  req,
  'membership-123',
  'admin' // role slug
);

console.log(result);
// { success: true, membership: { id, newRole: 'admin' } }
```

**Pre-flight Permission Checks:**

The SDK automatically validates permissions before making the API call:

| Rule | Description |
|------|-------------|
| Caller must be admin+ | Only admins and owners can change roles |
| Can't promote above self | Admins can't make someone an owner |
| Only owners can create owners | Owner promotion is owner-exclusive |
| Can't demote yourself | Prevents accidental lockout |

**Error Handling:**

```typescript
try {
  await authvader.memberships.setMemberRole(req, membershipId, 'owner');
} catch (error) {
  // AuthVaderError with descriptive messages:
  // - "Insufficient permissions: admin cannot promote to owner"
  // - "Cannot modify your own role"
  // - "Only owners can promote to owner role"
  console.error(error.message);
}
```

#### setApplicationRole()

Change a member's role in YOUR application.

```typescript
await authvader.memberships.setApplicationRole(
  req,
  'membership-123',
  'editor' // your app's role slug
);
```

#### remove()

Remove a member from a tenant entirely.

```typescript
await authvader.memberships.remove(req, 'membership-123');

// With confirmation
const result = await authvader.memberships.remove(req, membershipId);
if (result.success) {
  console.log('Member removed');
}
```

### Permissions

```typescript
// Check a single permission
const { allowed } = await authvader.permissions.check(req, {
  permission: 'documents:write',
});

if (!allowed) {
  return res.status(403).json({ error: 'Forbidden' });
}

// Check multiple permissions at once
const results = await authvader.permissions.checkMany(req, {
  permissions: ['documents:read', 'documents:write', 'admin:access'],
});
// Returns: { 'documents:read': true, 'documents:write': true, 'admin:access': false }

// Check if user has ANY of the permissions
const { allowed: hasAny } = await authvader.permissions.checkAny(req, {
  permissions: ['documents:write', 'documents:admin'],
});

// Check if user has ALL of the permissions
const { allowed: hasAll } = await authvader.permissions.checkAll(req, {
  permissions: ['documents:read', 'documents:write'],
});
```

### Licenses

#### Basic License Checks

```typescript
// Check if user has a license for an application
const { hasLicense, licenseType, features } = await authvader.licenses.check(req, {
  applicationId: 'app-123',
});

// Check for a specific feature
const { hasFeature } = await authvader.licenses.hasFeature(req, {
  applicationId: 'app-123',
  feature: 'advanced-analytics',
});

// Get user's full license details
const license = await authvader.licenses.getUserLicense(req, {
  applicationId: 'app-123',
});
// Returns: { type, name, features, assignedAt, expiresAt, ... }
```

#### getUserLicenseType()

Convenience wrapper to get just the license type.

```typescript
// For current user
const type = await authvader.licenses.getUserLicenseType(req);
// Returns: 'enterprise' | 'pro' | 'free' | undefined

// For a specific user and application
const type = await authvader.licenses.getUserLicenseType(
  req,
  'user-123',           // userId (undefined = current user)
  'app-456'             // applicationId (undefined = current app from config)
);

// Practical usage
const licenseType = await authvader.licenses.getUserLicenseType(req);
if (licenseType === 'enterprise') {
  enableEnterpriseFeatures();
}
```

#### listForUser()

Get ALL licenses for a user across all applications.

```typescript
const licenses = await authvader.licenses.listForUser(req, 'user-123');

console.log(licenses);
// [
//   { applicationId: 'app-1', type: 'enterprise', features: ['sso', 'api'], assignedAt: '...' },
//   { applicationId: 'app-2', type: 'pro', features: ['export'], assignedAt: '...' },
// ]

// Use case: Admin viewing user's entitlements
app.get('/admin/users/:id/licenses', async (req, res) => {
  const licenses = await authvader.licenses.listForUser(req, req.params.id);
  res.json({ licenses });
});
```

#### Grant and Revoke

```typescript
// Grant a license to a user
await authvader.licenses.grant(req, {
  userId: 'user-123',
  applicationId: 'app-123',
  licenseTypeId: 'license-pro',
  tenantId: 'tenant-123',
});

// Revoke a license
await authvader.licenses.revoke(req, {
  userId: 'user-123',
  applicationId: 'app-123',
  tenantId: 'tenant-123',
});
```

#### changeType()

Upgrade or downgrade a user's license type.

```typescript
await authvader.licenses.changeType(req, {
  userId: 'user-123',
  applicationId: 'app-456',
  newLicenseTypeId: 'license-enterprise',
});

// Practical usage: Upgrade flow
app.post('/api/billing/upgrade', async (req, res) => {
  const claims = await authvader.validateRequest(req);
  
  // Process payment...
  
  // Upgrade license
  await authvader.licenses.changeType(req, {
    userId: claims.sub,
    applicationId: process.env.APP_ID!,
    newLicenseTypeId: 'license-enterprise',
  });
  
  res.json({ success: true, newLicense: 'enterprise' });
});
```

#### getHolders()

Get all license holders for an application - useful for admin dashboards.

```typescript
const holders = await authvader.licenses.getHolders(req, 'app-456');

console.log(holders);
// [
//   { userId: 'user-1', email: 'alice@example.com', licenseType: 'enterprise', assignedAt: '...' },
//   { userId: 'user-2', email: 'bob@example.com', licenseType: 'pro', assignedAt: '...' },
// ]

// Filter by license type
const enterpriseUsers = holders.filter(h => h.licenseType === 'enterprise');
```

#### countLicensedUsers()

Get a count of licensed users - great for dashboards!

```typescript
const { count } = await authvader.licenses.countLicensedUsers(req, 'app-456');
console.log(`You have ${count} licensed users`);

// With breakdown
const { count, breakdown } = await authvader.licenses.countLicensedUsers(req, 'app-456', {
  includeBreakdown: true,
});
console.log(breakdown);
// { enterprise: 5, pro: 20, free: 100 }
```

#### getAuditLog()

Get license change history for compliance and debugging.

```typescript
const auditLog = await authvader.licenses.getAuditLog(req, {
  userId: 'user-123',  // Optional: filter by user
  limit: 50,           // Optional: default 20
  offset: 0,           // Optional: for pagination
});

console.log(auditLog);
// [
//   {
//     id: 'audit-1',
//     action: 'LICENSE_GRANTED',
//     userId: 'user-123',
//     licenseType: 'pro',
//     performedBy: 'admin-456',
//     timestamp: '2024-01-15T10:30:00Z',
//     metadata: { reason: 'Upgrade from trial' }
//   },
//   {
//     id: 'audit-2',
//     action: 'LICENSE_UPGRADED',
//     userId: 'user-123',
//     previousType: 'pro',
//     newType: 'enterprise',
//     performedBy: 'admin-456',
//     timestamp: '2024-02-01T14:00:00Z',
//   },
// ]
```

**Audit Action Types:**

| Action | Description |
|--------|-------------|
| `LICENSE_GRANTED` | New license assigned |
| `LICENSE_REVOKED` | License removed |
| `LICENSE_UPGRADED` | Changed to higher tier |
| `LICENSE_DOWNGRADED` | Changed to lower tier |
| `LICENSE_EXPIRED` | Automatic expiration |

#### Usage Analytics

Track license usage for billing and analytics.

##### getUsageOverview()

```typescript
const overview = await authvader.licenses.getUsageOverview(req);

console.log(overview);
// {
//   totalLicenses: 125,
//   activeLicenses: 118,
//   byType: {
//     enterprise: { total: 5, active: 5 },
//     pro: { total: 20, active: 18 },
//     free: { total: 100, active: 95 },
//   },
//   utilizationRate: 0.944, // 94.4%
// }
```

##### getUsageTrends()

```typescript
// Get usage trends for the last 30 days
const trends = await authvader.licenses.getUsageTrends(req, 30);

console.log(trends);
// {
//   period: '30d',
//   dataPoints: [
//     { date: '2024-01-01', totalActive: 100, byType: { enterprise: 3, pro: 15, free: 82 } },
//     { date: '2024-01-02', totalActive: 102, byType: { enterprise: 3, pro: 16, free: 83 } },
//     // ... 28 more days
//   ],
//   growth: {
//     absolute: 25,      // +25 licenses
//     percentage: 0.25,  // +25%
//   }
// }

// Use for charts
const chartData = trends.dataPoints.map(d => ({
  x: d.date,
  y: d.totalActive,
}));
```

#### Complete Example: License Management Dashboard

```typescript
app.get('/api/admin/license-dashboard', async (req, res) => {
  // Verify admin permission
  if (!await authvader.hasTenantPermission(req, 'licenses:manage')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const appId = process.env.APP_ID!;
  
  // Fetch all license data in parallel
  const [
    { count, breakdown },
    holders,
    overview,
    trends,
    auditLog,
  ] = await Promise.all([
    authvader.licenses.countLicensedUsers(req, appId, { includeBreakdown: true }),
    authvader.licenses.getHolders(req, appId),
    authvader.licenses.getUsageOverview(req),
    authvader.licenses.getUsageTrends(req, 30),
    authvader.licenses.getAuditLog(req, { limit: 10 }),
  ]);
  
  res.json({
    summary: {
      totalUsers: count,
      breakdown,
      utilizationRate: overview.utilizationRate,
    },
    users: holders,
    trends: trends.dataPoints,
    growth: trends.growth,
    recentActivity: auditLog,
  });
});
```

### Sessions

```typescript
// List user's active sessions
const { sessions } = await authvader.sessions.list(req);
// Returns: [{ id, userAgent, ipAddress, createdAt, lastActiveAt, current: boolean }]

// Revoke a specific session
await authvader.sessions.revoke(req, 'session-id');

// Logout from all devices
await authvader.sessions.revokeAll(req);

// Get current session info
const currentSession = await authvader.sessions.current(req);
```

### Entitlements

Check what a user is entitled to across the system:

```typescript
// Get all entitlements for current user
const entitlements = await authvader.entitlements.get(req);
// Returns: {
//   tenants: [{ id, name, role, permissions }],
//   applications: [{ id, name, roles, license }],
//   features: ['sso', 'api-access', 'analytics']
// }

// Check specific entitlement
const { entitled } = await authvader.entitlements.check(req, {
  type: 'feature',
  key: 'advanced-analytics',
});
```

## Express Middleware Examples

### Basic Auth Middleware

```typescript
import { createAuthVader } from '@authvader/sdk/server';

const authvader = createAuthVader({ /* config */ });

export const requireAuth = async (req, res, next) => {
  const { authenticated, user, error } = await authvader.getCurrentUser(req);
  
  if (!authenticated) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: error 
    });
  }
  
  req.user = user;
  next();
};
```

### Permission Middleware Factory

```typescript
export const requirePermission = (...permissions: string[]) => {
  return async (req, res, next) => {
    const { allowed } = await authvader.permissions.checkAll(req, {
      permissions,
    });
    
    if (!allowed) {
      return res.status(403).json({
        error: 'Forbidden',
        required: permissions,
      });
    }
    
    next();
  };
};

// Usage:
app.delete('/api/users/:id', 
  requireAuth, 
  requirePermission('users:delete'), 
  deleteUserHandler
);
```

### License Gate Middleware

```typescript
export const requireLicense = (applicationId: string, feature?: string) => {
  return async (req, res, next) => {
    if (feature) {
      const { hasFeature } = await authvader.licenses.hasFeature(req, {
        applicationId,
        feature,
      });
      
      if (!hasFeature) {
        return res.status(402).json({
          error: 'License Required',
          feature,
          upgradeUrl: '/pricing',
        });
      }
    } else {
      const { hasLicense } = await authvader.licenses.check(req, {
        applicationId,
      });
      
      if (!hasLicense) {
        return res.status(402).json({
          error: 'License Required',
          upgradeUrl: '/pricing',
        });
      }
    }
    
    next();
  };
};

// Usage:
app.get('/api/analytics',
  requireAuth,
  requireLicense('my-app', 'advanced-analytics'),
  analyticsHandler
);
```

### Tenant Scope Middleware

```typescript
export const requireTenantAccess = async (req, res, next) => {
  const { user } = req;
  const tenantId = req.params.tenantId || req.query.tenantId;
  
  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID required' });
  }
  
  // Check if user's token is scoped to this tenant
  if (user.tenant_id && user.tenant_id !== tenantId) {
    return res.status(403).json({ error: 'Token not scoped to this tenant' });
  }
  
  // Or check membership
  const tenants = await authvader.memberships.listUserTenants(req);
  const hasAccess = tenants.some(t => t.id === tenantId);
  
  if (!hasAccess) {
    return res.status(403).json({ error: 'Not a member of this tenant' });
  }
  
  req.tenantId = tenantId;
  next();
};
```

## NestJS Integration

### Auth Guard

```typescript
// guards/auth.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { createAuthVader } from '@authvader/sdk/server';

@Injectable()
export class AuthGuard implements CanActivate {
  private authvader = createAuthVader({
    authVaderHost: process.env.AUTHVADER_HOST!,
    clientId: process.env.AUTHVADER_CLIENT_ID!,
    clientSecret: process.env.AUTHVADER_CLIENT_SECRET!,
  });

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { authenticated, user } = await this.authvader.getCurrentUser(request);
    
    if (!authenticated) {
      return false;
    }
    
    request.user = user;
    return true;
  }
}
```

### Permission Decorator

```typescript
// decorators/permissions.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

// guards/permissions.guard.ts
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredPermissions) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    return requiredPermissions.every(
      permission => user.app_permissions?.includes(permission)
    );
  }
}

// Usage in controller:
@Controller('users')
@UseGuards(AuthGuard, PermissionsGuard)
export class UsersController {
  @Delete(':id')
  @RequirePermissions('users:delete')
  async deleteUser(@Param('id') id: string) {
    // ...
  }
}
```

## OAuth Flow Utilities

For custom OAuth implementations:

```typescript
import {
  generatePKCE,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
} from '@authvader/sdk/server';

// Generate PKCE challenge pair
const { codeVerifier, codeChallenge } = await generatePKCE();

// Build authorization URL
const authorizeUrl = buildAuthorizeUrl({
  authVaderHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  redirectUri: 'https://yourapp.com/callback',
  codeChallenge,
  scope: 'openid profile email',
  state: crypto.randomUUID(),
});

// Exchange code for tokens (after callback)
const tokens = await exchangeCodeForTokens({
  authVaderHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  code: authorizationCode,
  codeVerifier,
  redirectUri: 'https://yourapp.com/callback',
});

// Refresh an access token
const newTokens = await refreshAccessToken({
  authVaderHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  refreshToken: tokens.refresh_token,
});
```

## URL Builders

Generate URLs for auth flows:

```typescript
import {
  getLoginUrl,
  getSignupUrl,
  getLogoutUrl,
  getPasswordResetUrl,
} from '@authvader/sdk/server';

// Login URL (starts OAuth flow)
const loginUrl = getLoginUrl({
  authVaderHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  redirectUri: 'https://yourapp.com/callback',
});

// Signup URL
const signupUrl = getSignupUrl({
  authVaderHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  redirectUri: 'https://yourapp.com/callback',
});

// Logout URL
const logoutUrl = getLogoutUrl({
  authVaderHost: 'https://auth.yourapp.com',
  postLogoutRedirectUri: 'https://yourapp.com',
});

// Password reset URL
const resetUrl = getPasswordResetUrl({
  authVaderHost: 'https://auth.yourapp.com',
  email: 'user@example.com',
});
```

## Error Handling

```typescript
import { AuthVaderError } from '@authvader/sdk/server';

try {
  const { authenticated, user, error } = await authvader.getCurrentUser(req);
  
  if (!authenticated) {
    // error contains: 'token_expired', 'invalid_signature', 'no_token', etc.
    console.log('Auth failed:', error);
  }
} catch (err) {
  if (err instanceof AuthVaderError) {
    console.error('AuthVader error:', err.code, err.message);
  }
}
```

## TypeScript Types

All types are exported for type-safe development:

```typescript
import type {
  // Configuration
  AuthVaderClientConfig,
  OAuthFlowConfig,
  JwtMiddlewareOptions,
  PassportJwtOptions,
  
  // JWT & Validation
  EnhancedJwtPayload,
  JwtLicenseInfo,
  ValidatedClaims,
  
  // Management URLs
  ManagementUrls,
  
  // Memberships
  MembershipUser,
  MembershipListResponse,
  TenantsForUserResponse,
  TenantRole,
  ApplicationRole,
  SetMemberRoleResult,
  
  // Invitations
  InvitationResponse,
  PendingInvitation,
  
  // Licensing
  LicenseCheckResponse,
  LicenseDetails,
  LicenseHolder,
  LicenseAuditEntry,
  LicenseAuditAction,
  LicenseUsageOverview,
  LicenseUsageTrends,
  LicenseCountResult,
  TenantLicenseOverview,
  SubscriptionSummary,
  
  // OAuth
  TokenResponse,
  PKCEPair,
  
  // Sessions
  Session,
  SessionListResponse,
  
  // Entitlements  
  EntitlementsResponse,
  EntitlementCheckResult,
} from '@authvader/sdk/server';
```

### Key Type Definitions

```typescript
// ValidatedClaims - returned by validateRequest()
interface ValidatedClaims {
  sub: string;
  tenantId: string;
  tenantSubdomain?: string;
  email?: string;
  tenant_roles?: string[];
  payload: JwtPayload;
}

// ManagementUrls - returned by getManagementUrls()
interface ManagementUrls {
  overview: string;
  members: string;
  applications: string;
  settings: string;
  accountSettings: string;
}

// LicenseAuditEntry - returned by getAuditLog()
interface LicenseAuditEntry {
  id: string;
  action: LicenseAuditAction;
  userId: string;
  licenseType?: string;
  previousType?: string;
  newType?: string;
  performedBy: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

type LicenseAuditAction = 
  | 'LICENSE_GRANTED'
  | 'LICENSE_REVOKED'
  | 'LICENSE_UPGRADED'
  | 'LICENSE_DOWNGRADED'
  | 'LICENSE_EXPIRED';

// LicenseUsageTrends - returned by getUsageTrends()
interface LicenseUsageTrends {
  period: string;
  dataPoints: Array<{
    date: string;
    totalActive: number;
    byType: Record<string, number>;
  }>;
  growth: {
    absolute: number;
    percentage: number;
  };
}
```

---

## Quick Reference: API Calls vs JWT Reads

> **Performance tip:** Methods that read from JWT are instant! Use them when possible.

### ⚡ No API Call (Reads from JWT)

| Method | What it does |
|--------|-------------|
| `hasTenantPermission(req, perm)` | Check tenant permission from `tenant_permissions` claim |
| `hasAppPermission(req, perm)` | Check app permission from `app_permissions` claim |
| `hasFeatureFromJwt(req, feature)` | Check feature from `license.features` claim |
| `getLicenseTypeFromJwt(req)` | Get license type from `license.type` claim |
| `getTenantPermissions(req)` | Get all tenant permissions array |
| `getAppPermissions(req)` | Get all app permissions array |
| `getTenantRoles(req)` | Get tenant roles array |
| `getAppRoles(req)` | Get app roles array |
| `getCurrentUser(req)` | Validate JWT and extract claims |
| `validateRequest(req)` | Strict JWT validation with guaranteed claims |
| `getAccountSettingsUrl()` | Build static URL (no req needed!) |

### 🌐 Makes API Call

| Method | Endpoint | Use Case |
|--------|----------|----------|
| `memberships.listForTenant()` | `GET /api/tenants/:id/members` | Admin member list |
| `memberships.listTenantsForUser()` | `GET /api/users/me/tenants` | Org picker |
| `memberships.listForApplication()` | `GET /api/applications/:id/members` | App user list |
| `memberships.setMemberRole()` | `PATCH /api/memberships/:id/role` | Role management |
| `memberships.getTenantRoles()` | `GET /api/roles/tenant` | Get role definitions |
| `memberships.getApplicationRoles()` | `GET /api/roles/application` | Get app role definitions |
| `licenses.check()` | `GET /api/licenses/check` | Real-time license verification |
| `licenses.hasFeature()` | `GET /api/licenses/features/:feature` | Real-time feature check |
| `licenses.getUserLicense()` | `GET /api/users/:id/license` | Full license details |
| `licenses.grant()` | `POST /api/licenses` | Grant license |
| `licenses.revoke()` | `DELETE /api/licenses` | Revoke license |
| `licenses.changeType()` | `PATCH /api/licenses/type` | Upgrade/downgrade |
| `licenses.getHolders()` | `GET /api/applications/:id/license-holders` | All license holders |
| `licenses.getAuditLog()` | `GET /api/licenses/audit` | License history |
| `licenses.getUsageOverview()` | `GET /api/licenses/usage` | Usage stats |
| `licenses.getUsageTrends()` | `GET /api/licenses/trends` | Usage over time |
| `permissions.check()` | `GET /api/permissions/check` | Server-side permission check |
| `invitations.send()` | `POST /api/invitations` | Send invite |
| `sessions.list()` | `GET /api/sessions` | List user sessions |
| `getManagementUrls()` | None (but reads tenant from JWT) | Build management URLs |

### When to Use JWT vs API?

```typescript
// ✅ FAST: Use JWT helpers for real-time UI decisions
if (await authvader.hasAppPermission(req, 'projects:edit')) {
  showEditButton();
}

// ✅ ACCURATE: Use API for critical operations
const { allowed } = await authvader.permissions.check(req, {
  permission: 'billing:manage',
});
if (allowed) {
  processRefund();
}
```

**JWT Pros:** Instant, no network latency, works offline
**JWT Cons:** Stale until token refresh (typically 15-60 min)

**API Pros:** Always current, server-authoritative
**API Cons:** Network latency, can fail

---

## Related Documentation

- [Client SDK (React)](./client-sdk.md)
- [User Sync Guide](./user-sync.md)
- [Webhooks Guide](./webhooks.md)
- [OAuth Flow Details](../concepts/oauth-flow.md)
- [JWT Claims Reference](../reference/jwt-claims.md)
