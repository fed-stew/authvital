# AuthVital SDK Documentation

> **@authvital/sdk** - Official TypeScript SDK for integrating with AuthVital Identity Provider.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Server SDK](#server-sdk)
  - [Creating the Client](#creating-the-client)
  - [JWT Validation](#jwt-validation)
  - [Permission & Role Helpers](#permission--role-helpers)
  - [Namespaced APIs](#namespaced-apis)
  - [OAuth Flow](#oauth-flow)
  - [URL Builders](#url-builders)
  - [Management URLs](#management-urls)
- [Client SDK (React)](#client-sdk-react)
  - [AuthVitalProvider](#authvitalprovider)
  - [useAuth Hook](#useauth-hook)
  - [useOAuth Hook](#useoauth-hook)
  - [useInvitation Hook](#useinvitation-hook)
- [Webhooks](#webhooks)
  - [WebhookRouter](#webhookrouter)
  - [AuthVitalEventHandler](#authvitaleventhandler)
  - [Event Types](#event-types)
- [Identity Sync](#identity-sync)
  - [Prisma Schema](#prisma-schema)
  - [IdentitySyncHandler](#identitysynchandler)
  - [Session Cleanup](#session-cleanup)
- [TypeScript Types](#typescript-types)
- [Environment Variables](#environment-variables)

---

## Installation

```bash
npm install @authvital/sdk
# or
yarn add @authvital/sdk
# or
pnpm add @authvital/sdk
```

---

## Quick Start

### Server-Side (Node.js/Backend)

```typescript
import { createAuthVital } from '@authvital/sdk/server';

const authvital = createAuthVital({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
});

// Validate JWT from incoming request
app.get('/api/protected', async (req, res) => {
  const { authenticated, user, error } = await authvital.getCurrentUser(req);

  if (!authenticated) {
    return res.status(401).json({ error: error || 'Unauthorized' });
  }

  res.json({ message: `Hello ${user.email}!` });
});
```

### Client-Side (React)

```tsx
import { AuthVitalProvider, useAuth } from '@authvital/sdk/client';

function App({ initialUser, initialTenants }) {
  return (
    <AuthVitalProvider
      authVitalHost={import.meta.env.VITE_AUTHVITAL_HOST}
      clientId={import.meta.env.VITE_AUTHVITAL_CLIENT_ID}
      initialUser={initialUser}
      initialTenants={initialTenants}
    >
      <MyApp />
    </AuthVitalProvider>
  );
}

function MyApp() {
  const { user, isAuthenticated, login, logout } = useAuth();

  if (!isAuthenticated) {
    return <button onClick={login}>Login</button>;
  }

  return (
    <div>
      <p>Welcome, {user?.email}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

---

## Server SDK

### Creating the Client

```typescript
import { createAuthVital } from '@authvital/sdk/server';

const authvital = createAuthVital({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
});
```

#### Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `authVitalHost` | `string` | Yes | AuthVital server URL (e.g., `https://auth.yourapp.com`) |
| `clientId` | `string` | Yes | OAuth client ID |
| `clientSecret` | `string` | Yes | OAuth client secret |
| `scope` | `string` | No | Default scopes (default: `system:admin`) |

---

### JWT Validation

#### getCurrentUser()

Extracts and validates the JWT from an incoming request. Returns a result object (doesn't throw).

```typescript
const { authenticated, user, error } = await authvital.getCurrentUser(req);

if (!authenticated) {
  return res.status(401).json({ error: error || 'Unauthorized' });
}

// user contains decoded JWT claims
console.log(user.sub);            // User ID
console.log(user.email);          // Email address
console.log(user.tenant_id);      // Tenant ID (if scoped)
console.log(user.app_roles);      // ['admin', 'editor']
console.log(user.app_permissions);// ['documents:read', 'documents:write']
console.log(user.license);        // { type: 'pro', name: 'Pro Plan', features: ['sso', 'api'] }
```

#### validateRequest()

Strict validation that **throws** if not authenticated or missing required claims.

```typescript
try {
  const claims = await authvital.validateRequest(req);

  // claims.tenantId is GUARANTEED to exist
  console.log('User:', claims.sub);
  console.log('Tenant:', claims.tenantId);
  console.log('Email:', claims.email);

  // Access full JWT payload if needed
  console.log('License:', claims.payload.license);
} catch (error) {
  // AuthVitalError with descriptive message
  res.status(401).json({ error: error.message });
}
```

**ValidatedClaims Interface:**

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

**When to use which:**

| Method | Use Case |
|--------|----------|
| `getCurrentUser()` | Soft check, custom error handling, optional auth |
| `validateRequest()` | Strict check, guaranteed claims, tenant-required endpoints |

---

### Permission & Role Helpers

These methods read from the validated JWT - **no API calls needed!**

```typescript
// Check tenant permission (supports wildcards like 'licenses:*')
if (await authvital.hasTenantPermission(req, 'licenses:manage')) {
  // User can manage licenses
}

// Check app permission
if (await authvital.hasAppPermission(req, 'projects:create')) {
  // User can create projects
}

// Check feature from license
if (await authvital.hasFeatureFromJwt(req, 'sso')) {
  // User's tenant has SSO enabled
}

// Get license type
const licenseType = await authvital.getLicenseTypeFromJwt(req);
if (licenseType === 'enterprise') {
  // Show enterprise features
}

// Get all permissions/roles
const tenantPerms = await authvital.getTenantPermissions(req);
const appPerms = await authvital.getAppPermissions(req);
const tenantRoles = await authvital.getTenantRoles(req);
const appRoles = await authvital.getAppRoles(req);
```

---

### Namespaced APIs

The SDK provides namespaced methods for different operations. All methods that take a `request` parameter automatically extract the JWT for authentication.

#### Invitations

```typescript
// Send an invitation (tenantId extracted from JWT)
const { sub, expiresAt } = await authvital.invitations.send(req, {
  email: 'newuser@example.com',
  givenName: 'John',        // Optional
  familyName: 'Doe',        // Optional
  roleId: 'role-admin-id',  // Required - get from memberships.getTenantRoles()
  expiresInDays: 7,         // Optional
});

// List pending invitations
const { invitations, totalCount } = await authvital.invitations.listPending(req);

// Resend an invitation
const { expiresAt } = await authvital.invitations.resend(req, {
  invitationId: 'inv-123',
  expiresInDays: 7,
});

// Revoke an invitation
await authvital.invitations.revoke(req, 'inv-123');
```

#### Memberships

```typescript
// List tenant members
const { memberships, totalCount } = await authvital.memberships.listForTenant(req, {
  status: 'ACTIVE',        // Optional: 'ACTIVE' | 'INVITED' | 'SUSPENDED'
  includeRoles: true,      // Optional
  appendClientId: true,    // Auto-appends ?client_id=... to initiateLoginUri
});

// Get user's tenants (from JWT)
const { memberships } = await authvital.memberships.listTenantsForUser(req, {
  status: 'ACTIVE',
  includeRoles: true,
  appendClientId: true,
});

// Get available tenant roles (for role pickers)
const { roles } = await authvital.memberships.getTenantRoles();
// roles = [{ slug: 'owner', name: 'Owner', permissions: [...] }, ...]

// Get application roles (for your app)
const { roles } = await authvital.memberships.getApplicationRoles();

// Set a member's role
const result = await authvital.memberships.setMemberRole(
  req,
  'membership-123',
  'admin', // role slug
);

// Validate membership
const { isMember, membership } = await authvital.memberships.validate(req);
```

#### Licenses

```typescript
// Grant a license to a user
await authvital.licenses.grant(req, {
  userId: 'user-123',        // Optional - defaults to authenticated user
  applicationId: 'app-456',
  licenseTypeId: 'license-pro',
});

// Revoke a license
await authvital.licenses.revoke(req, {
  userId: 'user-123',
  applicationId: 'app-456',
});

// Change license type
await authvital.licenses.changeType(req, {
  userId: 'user-123',
  applicationId: 'app-456',
  newLicenseTypeId: 'license-enterprise',
});

// Check if user has a license
const { hasLicense, licenseType, features } = await authvital.licenses.check(
  req,
  undefined,      // userId - null for authenticated user
  'my-app-id',
);

// Check specific feature
const { hasFeature } = await authvital.licenses.hasFeature(
  req,
  undefined,      // userId
  'my-app-id',
  'sso',          // feature key
);

// Get all licenses for a user
const licenses = await authvital.licenses.listForUser(req);
const licenses = await authvital.licenses.listForUser(req, 'other-user-id');

// Get all license holders for an app
const holders = await authvital.licenses.getHolders(req, 'app-456');

// Get license audit log
const auditLog = await authvital.licenses.getAuditLog(req, {
  userId: 'user-123',
  limit: 50,
  offset: 0,
});

// Get usage overview
const usage = await authvital.licenses.getUsageOverview(req);
// { totalSeats: 10, seatsAssigned: 8, utilization: 80, ... }

// Get usage trends
const trends = await authvital.licenses.getUsageTrends(req, 30); // last 30 days
```

#### Sessions

```typescript
// List user's active sessions
const { sessions, count } = await authvital.sessions.list(req);

// Revoke a specific session
await authvital.sessions.revoke(req, 'session-id');

// Revoke ALL sessions (logout everywhere)
const { count } = await authvital.sessions.revokeAll(req);

// Logout current session (using refresh token)
await authvital.sessions.logout(refreshToken);
```

#### Permissions (API Check)

For API-based permission checks (when you need server-authoritative validation):

```typescript
// Check a single permission via API
const { allowed, reason } = await authvital.permissions.check(req, {
  userId: 'user-123',
  tenantId: 'tenant-456',
  permission: 'documents:write',
});

// Check multiple permissions
const { results, allAllowed } = await authvital.permissions.checkMany(req, {
  userId: 'user-123',
  tenantId: 'tenant-456',
  permissions: ['documents:read', 'documents:write', 'admin:access'],
});
// results = { 'documents:read': true, 'documents:write': true, 'admin:access': false }
```

#### Entitlements

```typescript
// Check feature entitlement
const { hasAccess, licenseType, reason } = await authvital.entitlements.checkFeature(
  req,
  'advanced-analytics',
);
```

---

### OAuth Flow

For server-side OAuth with PKCE:

```typescript
import { OAuthFlow } from '@authvital/sdk/server';

const oauth = new OAuthFlow({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  clientId: process.env.AUTHVITAL_CLIENT_ID!,
  clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
  redirectUri: 'https://myapp.com/api/auth/callback',
});

// GET /api/auth/login
app.get('/api/auth/login', (req, res) => {
  const { authorizeUrl, state, codeVerifier } = oauth.startFlow({
    appState: req.query.returnTo, // Optional - passed through OAuth
  });

  // Store for callback verification
  req.session.oauthState = state;
  req.session.codeVerifier = codeVerifier;

  res.redirect(authorizeUrl);
});

// GET /api/auth/callback
app.get('/api/auth/callback', async (req, res) => {
  const tokens = await oauth.handleCallback(
    req.query.code,
    req.query.state,
    req.session.oauthState,
    req.session.codeVerifier,
  );

  // tokens: { access_token, refresh_token, id_token, appState }
  // Set cookies, redirect to appState or dashboard
  res.cookie('access_token', tokens.access_token, { httpOnly: true });
  res.redirect(tokens.appState || '/dashboard');
});

// Refresh tokens
const newTokens = await oauth.refreshTokens(refreshToken);
```

#### Low-Level PKCE Utilities

```typescript
import {
  generatePKCE,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  encodeState,
  decodeState,
} from '@authvital/sdk/server';

// Generate PKCE challenge
const { codeVerifier, codeChallenge } = generatePKCE();

// Encode/decode state with CSRF and app state
const state = encodeState(csrfNonce, '/dashboard?tab=settings');
const { csrf, appState } = decodeState(state);

// Build authorization URL manually
const authorizeUrl = buildAuthorizeUrl({
  authVitalHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  redirectUri: 'https://yourapp.com/callback',
  codeChallenge,
  state,
});

// Exchange code for tokens
const tokens = await exchangeCodeForTokens({
  authVitalHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  code: 'authorization-code',
  codeVerifier,
  redirectUri: 'https://yourapp.com/callback',
});
```

---

### URL Builders

Simple URL builders for landing pages, emails, and marketing links (no PKCE needed):

```typescript
import {
  getLoginUrl,
  getSignupUrl,
  getLogoutUrl,
  getPasswordResetUrl,
  getInviteAcceptUrl,
  getAccountSettingsUrl,
} from '@authvital/sdk/server';

// Login URL
const loginUrl = getLoginUrl({
  authVitalHost: 'https://auth.myapp.com',
  clientId: 'my-app',
  redirectUri: 'https://app.myapp.com/dashboard',
  tenantHint: 'acme-corp', // Optional
});

// Signup URL with pre-filled email
const signupUrl = getSignupUrl({
  authVitalHost: 'https://auth.myapp.com',
  clientId: 'my-app',
  redirectUri: 'https://app.myapp.com/onboarding',
  email: 'user@example.com', // Optional
});

// Logout URL
const logoutUrl = getLogoutUrl({
  authVitalHost: 'https://auth.myapp.com',
  postLogoutRedirectUri: 'https://myapp.com/',
});

// Password reset URL
const resetUrl = getPasswordResetUrl({
  authVitalHost: 'https://auth.myapp.com',
  clientId: 'my-app',
  email: 'user@example.com',
});

// Invitation acceptance URL (for emails)
const inviteUrl = getInviteAcceptUrl({
  authVitalHost: 'https://auth.myapp.com',
  clientId: 'my-app',
  inviteToken: 'abc123xyz',
});

// Account settings URL (standalone)
const settingsUrl = getAccountSettingsUrl('https://auth.myapp.com');
```

---

### Management URLs

Get URLs for AuthVital's management pages (extracts tenantId from JWT):

```typescript
// Get all management URLs at once
const urls = await authvital.getManagementUrls(req);
// {
//   overview: 'https://auth.example.com/tenant/abc/overview',
//   members: 'https://auth.example.com/tenant/abc/members',
//   applications: 'https://auth.example.com/tenant/abc/applications',
//   settings: 'https://auth.example.com/tenant/abc/settings',
//   accountSettings: 'https://auth.example.com/account/settings',
// }

// Or individually
const membersUrl = await authvital.getMembersUrl(req);
const applicationsUrl = await authvital.getApplicationsUrl(req);
const settingsUrl = await authvital.getSettingsUrl(req);
const overviewUrl = await authvital.getOverviewUrl(req);
const accountUrl = authvital.getAccountSettingsUrl(); // No request needed
```

---

## Client SDK (React)

> ⚠️ **IMPORTANT**: The Client SDK manages state only - it does NOT call the AuthVital IDP directly. Auth tokens are stored in httpOnly cookies set by YOUR server. This is intentional for XSS protection.

### AuthVitalProvider

Wrap your app to enable authentication:

```tsx
import { AuthVitalProvider } from '@authvital/sdk/client';

function App({ initialUser, initialTenants }) {
  return (
    <AuthVitalProvider
      authVitalHost="https://auth.yourapp.com"
      clientId="your-client-id"
      initialUser={initialUser}      // From your server
      initialTenants={initialTenants} // From your server
    >
      <Router>
        <Routes />
      </Router>
    </AuthVitalProvider>
  );
}
```

#### Provider Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `authVitalHost` | `string` | Yes | AuthVital server URL |
| `clientId` | `string` | Yes | OAuth client ID |
| `initialUser` | `AuthVitalUser \| null` | No | Pre-loaded user from server |
| `initialTenants` | `AuthVitalTenant[]` | No | Pre-loaded tenants from server |

---

### useAuth Hook

```tsx
import { useAuth } from '@authvital/sdk/client';

function Dashboard() {
  const {
    // State
    isAuthenticated,
    isLoading,
    isSigningIn,
    isSigningUp,
    user,
    tenants,
    currentTenant,
    error,

    // Auth methods (redirect to OAuth)
    login,
    signUp,
    signOut,
    logout,

    // Tenant methods
    setActiveTenant,
    switchTenant,

    // State setters (after server verification)
    setAuthState,
    clearAuthState,
  } = useAuth();

  // Update state after server verification
  const handleOAuthCallback = async (code) => {
    const response = await fetch('/api/auth/callback', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    const { user, tenants } = await response.json();
    setAuthState(user, tenants);
  };

  return (
    <div>
      {isAuthenticated ? (
        <>
          <p>Welcome, {user?.email}!</p>
          <button onClick={logout}>Logout</button>
        </>
      ) : (
        <button onClick={login}>Login</button>
      )}
    </div>
  );
}
```

---

### useOAuth Hook

For more control over OAuth redirects:

```tsx
import { useOAuth } from '@authvital/sdk/client';

function LoginPage() {
  const { isAuthenticated, isLoading, startLogin, startSignup, logout } = useOAuth({
    redirectUri: '/api/auth/callback', // Optional
  });

  return (
    <div>
      <button onClick={() => startLogin({ state: '/dashboard' })}>
        Login
      </button>
      <button onClick={() => startSignup()}>
        Sign Up
      </button>
    </div>
  );
}
```

---

### useInvitation Hook

Handle team invitation flows:

```tsx
import { useInvitation } from '@authvital/sdk/client';

function AcceptInvitePage() {
  const token = new URLSearchParams(location.search).get('token');

  const {
    invitation,
    isLoading,
    error,
    consumed,
    hasPendingInvite,
    fetchInvitation,
    acceptAndLogin,
    consumeInvite,
  } = useInvitation({
    onConsumed: (result) => console.log('Joined tenant:', result.membership.tenant.name),
    onError: (error) => console.error('Failed:', error),
  });

  useEffect(() => {
    if (token) fetchInvitation(token);
  }, [token]);

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <div>
      <h1>You've been invited to {invitation?.tenant.name}</h1>
      <button onClick={() => acceptAndLogin(token!)}>
        Accept & Login
      </button>
    </div>
  );
}
```

---

## Webhooks

Webhooks are verified using JWKS - no shared secrets needed!

### WebhookRouter

```typescript
import { WebhookRouter, IdentitySyncHandler } from '@authvital/sdk/server';

// Option 1: Use built-in IdentitySyncHandler for database mirroring
const router = new WebhookRouter({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  handler: new IdentitySyncHandler(prisma),
});

app.post('/webhooks/authvital', router.expressHandler());
```

### AuthVitalEventHandler

Create a custom handler by extending the base class:

```typescript
import { AuthVitalEventHandler, WebhookRouter } from '@authvital/sdk/server';

class MyEventHandler extends AuthVitalEventHandler {
  async onSubjectCreated(event) {
    await sendWelcomeEmail(event.data.email);
    await db.users.create({ id: event.data.sub, email: event.data.email });
  }

  async onMemberJoined(event) {
    await notifyTeam(event.data.tenant_id, `${event.data.email} joined!`);
  }

  async onLicenseAssigned(event) {
    await provisionResources(event.data.sub, event.data.license_type_name);
  }

  async onInviteAccepted(event) {
    await notifyInviter(event.data.invited_by, event.data.email);
  }
}

const router = new WebhookRouter({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  handler: new MyEventHandler(),
});

app.post('/webhooks', router.expressHandler());
```

### Event Types

| Event | Handler Method | Description |
|-------|----------------|-------------|
| `invite.created` | `onInviteCreated` | Invitation sent |
| `invite.accepted` | `onInviteAccepted` | Invitation accepted |
| `invite.deleted` | `onInviteDeleted` | Invitation revoked |
| `invite.expired` | `onInviteExpired` | Invitation expired |
| `subject.created` | `onSubjectCreated` | User/service account created |
| `subject.updated` | `onSubjectUpdated` | User profile updated |
| `subject.deleted` | `onSubjectDeleted` | User deleted |
| `subject.deactivated` | `onSubjectDeactivated` | User deactivated |
| `member.joined` | `onMemberJoined` | User joined tenant |
| `member.left` | `onMemberLeft` | User left tenant |
| `member.role_changed` | `onMemberRoleChanged` | Member role changed |
| `member.suspended` | `onMemberSuspended` | Member suspended |
| `member.activated` | `onMemberActivated` | Member reactivated |
| `app_access.granted` | `onAppAccessGranted` | App access granted |
| `app_access.revoked` | `onAppAccessRevoked` | App access revoked |
| `app_access.role_changed` | `onAppAccessRoleChanged` | App role changed |
| `license.assigned` | `onLicenseAssigned` | License assigned |
| `license.revoked` | `onLicenseRevoked` | License revoked |
| `license.changed` | `onLicenseChanged` | License type changed |

---

## Identity Sync

Mirror AuthVital identities to your local database for offline queries and reduced API calls.

### Prisma Schema

```typescript
import { printSchema } from '@authvital/sdk/server';

// Print schema to console, then copy to your schema.prisma
printSchema();
```

This outputs:

```prisma
model Identity {
  id            String    @id                      // AuthVital subject ID
  email         String?   @unique
  givenName     String?   @map("given_name")
  familyName    String?   @map("family_name")
  pictureUrl    String?   @map("picture_url")
  thumbnailUrl  String?   @map("thumbnail_url")
  tenantId      String?   @map("tenant_id")
  appRole       String?   @map("app_role")
  isActive      Boolean   @default(true) @map("is_active")
  syncedAt      DateTime  @default(now()) @map("synced_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  sessions      IdentitySession[]

  @@map("identities")
}

model IdentitySession {
  id            String    @id @default(cuid())
  identityId    String    @map("identity_id")
  identity      Identity  @relation(fields: [identityId], references: [id], onDelete: Cascade)
  authSessionId String?   @unique @map("auth_session_id")
  deviceInfo    String?   @map("device_info")
  ipAddress     String?   @map("ip_address")
  userAgent     String?   @map("user_agent")
  createdAt     DateTime  @default(now()) @map("created_at")
  lastActiveAt  DateTime  @default(now()) @map("last_active_at")
  expiresAt     DateTime  @map("expires_at")
  revokedAt     DateTime? @map("revoked_at")

  @@index([identityId])
  @@map("identity_sessions")
}
```

### IdentitySyncHandler

```typescript
import { IdentitySyncHandler, WebhookRouter } from '@authvital/sdk/server';
import { prisma } from './prisma';

const syncHandler = new IdentitySyncHandler(prisma);

const router = new WebhookRouter({
  authVitalHost: process.env.AUTHVITAL_HOST!,
  handler: syncHandler,
});

app.post('/webhooks/authvital', router.expressHandler());
```

Enable these events in your AuthVital webhook configuration:

- `subject.created` - New user registered
- `subject.updated` - User profile changed
- `subject.deleted` - User deleted
- `subject.deactivated` - User deactivated
- `member.joined` - User joined tenant
- `member.left` - User left tenant
- `member.role_changed` - User's role changed
- `app_access.granted` - User granted app access
- `app_access.revoked` - User's app access revoked

### Session Cleanup

```typescript
import { cleanupSessions, getCleanupSQL } from '@authvital/sdk/server';

// Run daily via cron
cron.schedule('0 3 * * *', async () => {
  const result = await cleanupSessions(prisma, {
    expiredOlderThanDays: 30,  // Delete sessions expired 30+ days ago
    deleteRevoked: false,       // Keep revoked for audit trail
  });

  console.log(`Cleaned up ${result.deletedCount} sessions`);
});

// Or get raw SQL for pg_cron
const sql = getCleanupSQL({ expiredOlderThanDays: 30 });
// DELETE FROM identity_sessions WHERE expires_at < NOW() - INTERVAL '30 days';
```

---

## TypeScript Types

All types are exported for type-safe development:

```typescript
import type {
  // Config
  AuthVitalConfig,
  OAuthFlowConfig,

  // JWT & Auth
  EnhancedJwtPayload,
  ValidatedClaims,
  GetCurrentUserResult,
  TokenResponse,
  JwtLicenseInfo,

  // OAuth
  StatePayload,
  AuthorizeUrlParams,
  TokenExchangeParams,

  // Invitations
  InvitationResponse,
  PendingInvitation,
  SendInvitationParams,
  RevokeInvitationResponse,

  // Memberships
  TenantMembership,
  MembershipUser,
  UserTenantsResponse,
  TenantRolesResponse,
  ApplicationRolesResponse,

  // Licenses
  LicenseCheckResponse,
  LicenseGrantResponse,
  LicenseHolder,
  SubscriptionSummary,
  TenantLicenseOverview,

  // Sessions
  SessionInfo,
  SessionsListResponse,

  // Webhooks
  SyncEvent,
  SyncEventType,
  SubjectCreatedEvent,
  MemberJoinedEvent,
  LicenseAssignedEvent,

  // Sync
  IdentityBase,
  IdentityCreate,
  SessionCleanupOptions,
} from '@authvital/sdk/server';
```

---

## Environment Variables

```bash
# Required
AUTHVITAL_HOST=https://auth.yourapp.com
AUTHVITAL_CLIENT_ID=your-client-id
AUTHVITAL_CLIENT_SECRET=your-client-secret

# Optional (for OAuth flow)
AUTHVITAL_REDIRECT_URI=https://yourapp.com/api/auth/callback
```

---

## License

**TL;DR:** Free to use in your own projects. Modifications must be open-sourced. Commercial SaaS use requires written permission.

See [LICENSE](./LICENSE) for full terms.
