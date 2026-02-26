# @authvader/sdk

Official SDK for integrating with AuthVader Identity Provider.

## Installation

```bash
npm install @authvader/sdk
# or
yarn add @authvader/sdk
# or
pnpm add @authvader/sdk
```

## Quick Start

### Server-Side (Node.js/Backend)

```typescript
import { createAuthVader } from '@authvader/sdk/server';

const authvader = createAuthVader({
  authVaderHost: process.env.AUTHVADER_HOST!,
  clientId: process.env.AUTHVADER_CLIENT_ID!,
  clientSecret: process.env.AUTHVADER_CLIENT_SECRET!,
});

// Validate JWT from incoming request
app.get('/api/protected', async (req, res) => {
  const { authenticated, user } = await authvader.getCurrentUser(req);
  
  if (!authenticated) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  res.json({ message: `Hello ${user.email}!` });
});
```

### Client-Side (React)

```typescript
import { AuthVaderProvider, useAuth } from '@authvader/sdk/client';

function App() {
  return (
    <AuthVaderProvider
      authVaderHost={process.env.REACT_APP_AUTHVADER_HOST!}
      clientId={process.env.REACT_APP_CLIENT_ID!}
    >
      <MyApp />
    </AuthVaderProvider>
  );
}

function MyApp() {
  const { user, isAuthenticated, login, logout } = useAuth();
  
  if (!isAuthenticated) {
    return <button onClick={login}>Login</button>;
  }
  
  return (
    <div>
      <p>Welcome, {user.email}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

---

## Server SDK Features

### JWT Validation

```typescript
import { createAuthVader } from '@authvader/sdk/server';

const authvader = createAuthVader({
  authVaderHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
});

// Get current user from request
const { authenticated, user } = await authvader.getCurrentUser(req);

// User object includes:
// - sub: string (user ID)
// - email: string
// - given_name: string
// - family_name: string
// - picture: string (profile pic URL)
// - tenant_id: string (if scoped to tenant)
// - app_roles: string[] (role slugs)
// - app_permissions: string[] (permission keys)
// - license: { type, name, features }
```

### JWT Permission Helpers

Extract and check permissions directly from validated JWT claims:

```typescript
import {
  getPermissionsFromClaims,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getRolesFromClaims,
  hasRole,
  getTenantIdFromClaims,
} from '@authvader/sdk/server';

// After validating JWT, you have claims:
const { authenticated, user: claims } = await authvader.getCurrentUser(req);

if (authenticated) {
  // Get all permissions from the token
  const permissions = getPermissionsFromClaims(claims);
  // ['documents:read', 'documents:write', 'settings:view']

  // Check single permission
  if (hasPermission(claims, 'documents:write')) {
    // User can write documents
  }

  // Check if user has ANY of these permissions
  if (hasAnyPermission(claims, ['admin:access', 'documents:delete'])) {
    // Show delete button
  }

  // Check if user has ALL permissions
  if (hasAllPermissions(claims, ['billing:read', 'billing:write'])) {
    // Allow billing management
  }

  // Get roles
  const roles = getRolesFromClaims(claims); // ['admin', 'editor']
  if (hasRole(claims, 'admin')) {
    // Admin-only logic
  }

  // Get tenant context
  const tenantId = getTenantIdFromClaims(claims);
}
```

### Namespaces

The SDK provides namespaced methods for different operations:

#### Invitations

```typescript
// Send an invitation
await authvader.invitations.send({
  email: 'newuser@example.com',
  tenantId: 'tenant-123',
  roleId: 'role-member',
});

// List pending invitations
const pending = await authvader.invitations.listPending('tenant-123');

// Revoke an invitation
await authvader.invitations.revoke('invitation-id');
```

#### Memberships

```typescript
// List tenant members
const members = await authvader.memberships.listForTenant('tenant-123');

// Get user's tenants
const tenants = await authvader.memberships.listUserTenants(req);

// Set member role
await authvader.memberships.setTenantRole({
  membershipId: 'membership-123',
  roleSlug: 'admin',
});
```

#### Permissions

```typescript
// Check a single permission
const { allowed } = await authvader.permissions.check(req, {
  permission: 'documents:write',
});

// Check multiple permissions
const results = await authvader.permissions.checkMany(req, {
  permissions: ['documents:read', 'documents:write', 'admin:access'],
});
```

#### Licenses

```typescript
// Check if user has a license
const { hasLicense, licenseType } = await authvader.licenses.check(req, {
  applicationId: 'app-123',
});

// Check specific feature
const { hasFeature } = await authvader.licenses.hasFeature(req, {
  applicationId: 'app-123',
  feature: 'advanced-analytics',
});

// Grant a license (admin)
await authvader.licenses.grant(req, {
  userId: 'user-123',
  applicationId: 'app-123',
  licenseTypeId: 'license-pro',
});
```

#### Sessions

```typescript
// List user's active sessions
const { sessions } = await authvader.sessions.list(req);

// Revoke a specific session
await authvader.sessions.revoke(req, 'session-id');

// Logout from all devices
await authvader.sessions.revokeAll(req);
```

#### Entitlements

```typescript
// Check user's entitlements for a resource
const entitlements = await authvader.entitlements.check(req, {
  resourceType: 'api-calls',
});

// Returns: { limit, used, remaining, unlimited }
```

---

## OAuth Flow Utilities

### OAuthFlow Class (Recommended)

For server-side OAuth with PKCE:

```typescript
import { OAuthFlow } from '@authvader/sdk/server';

const oauth = new OAuthFlow({
  authVaderHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
  redirectUri: 'https://myapp.com/api/auth/callback',
});

// GET /api/auth/login
app.get('/api/auth/login', (req, res) => {
  const { authorizeUrl, state, codeVerifier } = oauth.startFlow({
    appState: req.query.returnTo, // Optional - gets passed through OAuth
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
    req.session.codeVerifier
  );
  
  // tokens includes: access_token, refresh_token, id_token, appState
  // Set cookies, redirect to appState or dashboard
});
```

### State Encoding

For custom flows that need CSRF + app state:

```typescript
import { encodeState, decodeState, type StatePayload } from '@authvader/sdk/server';

// Encode CSRF + app state into OAuth state param
const state = encodeState(csrfNonce, '/dashboard?tab=settings');

// Later, decode it
const payload: StatePayload = decodeState(state);
// { csrf: 'abc123', appState: '/dashboard?tab=settings' }
```

### URL Builders

For landing pages, emails, or simple redirects (no PKCE ceremony):

```typescript
import {
  getLoginUrl,
  getSignupUrl,
  getLogoutUrl,
  getInviteAcceptUrl,
} from '@authvader/sdk/server';

// Simple login link
const loginUrl = getLoginUrl({
  authVaderHost: 'https://auth.myapp.com',
  clientId: 'my-app',
  redirectUri: 'https://app.myapp.com/dashboard',
  tenantHint: 'acme-corp', // Optional
});

// Signup with pre-filled email
const signupUrl = getSignupUrl({
  authVaderHost: 'https://auth.myapp.com',
  clientId: 'my-app',
  redirectUri: 'https://app.myapp.com/onboarding',
  email: 'user@example.com', // Optional
});

// Logout URL
const logoutUrl = getLogoutUrl({
  authVaderHost: 'https://auth.myapp.com',
  postLogoutRedirectUri: 'https://myapp.com',
});

// Invitation acceptance link (for emails)
const inviteUrl = getInviteAcceptUrl({
  authVaderHost: 'https://auth.myapp.com',
  clientId: 'my-app',
  inviteToken: 'abc123xyz',
});
```

### Low-Level PKCE Utilities

For custom OAuth implementations:

```typescript
import {
  generatePKCE,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
} from '@authvader/sdk/server';

// Generate PKCE challenge
const { codeVerifier, codeChallenge } = await generatePKCE();

// Build authorization URL
const authorizeUrl = buildAuthorizeUrl({
  authVaderHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  redirectUri: 'https://yourapp.com/callback',
  codeChallenge,
  state: 'random-state',
});

// Exchange code for tokens
const tokens = await exchangeCodeForTokens({
  authVaderHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  code: 'authorization-code',
  codeVerifier,
  redirectUri: 'https://yourapp.com/callback',
});
```

---

## Identity Sync (Local Database Mirroring)

The SDK provides tools for syncing AuthVader identities to your local database, reducing API calls and enabling offline queries.

### Step 1: Add Prisma Schema

```typescript
import { printSchema } from '@authvader/sdk/server';

// Print schema to console, then copy to your schema.prisma
printSchema();
```

This outputs:

```prisma
model Identity {
  id            String    @id                      // AuthVader subject ID
  email         String?   @unique
  givenName     String?   @map("given_name")
  familyName    String?   @map("family_name")
  pictureUrl    String?   @map("picture_url")      // Profile picture
  thumbnailUrl  String?   @map("thumbnail_url")    // Small avatar
  tenantId      String?   @map("tenant_id")
  appRole       String?   @map("app_role")
  isActive      Boolean   @default(true) @map("is_active")
  syncedAt      DateTime  @default(now()) @map("synced_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  
  sessions      IdentitySession[]
  
  // Add your app-specific relations below
  // posts         Post[]
  // preferences   Json @default("{}")
  
  @@map("identities")
}

model IdentitySession {
  id            String    @id @default(cuid())
  identityId    String    @map("identity_id")
  identity      Identity  @relation(fields: [identityId], references: [id], onDelete: Cascade)
  authSessionId String?   @unique @map("auth_session_id")  // AuthVader session ID
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

### Step 2: Set Up Webhook Handler

```typescript
import { IdentitySyncHandler, WebhookRouter } from '@authvader/sdk/server';
import { prisma } from './prisma';

// Create the sync handler with your Prisma client
const syncHandler = new IdentitySyncHandler(prisma);

// Create the webhook router (uses JWKS for verification)
const router = new WebhookRouter({
  authVaderHost: process.env.AUTHVADER_HOST!,
  handler: syncHandler,
});

// Mount in your Express app
app.post('/webhooks/authvader', router.expressHandler());
```

### Step 3: Configure Webhook in AuthVader

In your AuthVader dashboard, add a webhook endpoint pointing to your `/webhooks/authvader` URL. Enable these events:

- `subject.created` - New user registered
- `subject.updated` - User profile changed
- `subject.deleted` - User deleted
- `subject.deactivated` - User deactivated
- `member.joined` - User joined tenant
- `member.left` - User left tenant
- `member.role_changed` - User's role changed
- `app_access.granted` - User granted app access
- `app_access.revoked` - User's app access revoked
- `app_access.role_changed` - User's app role changed

### Step 4: Optional Session Cleanup

```typescript
import { cleanupSessions } from '@authvader/sdk/server';

// Run daily via cron
cron.schedule('0 3 * * *', async () => {
  const result = await cleanupSessions(prisma, {
    expiredOlderThanDays: 30,  // Delete sessions expired 30+ days ago
    deleteRevoked: false,       // Keep revoked for audit trail
  });
  
  console.log(`Cleaned up ${result.deletedCount} sessions`);
});
```

Or use raw SQL with pg_cron:

```typescript
import { getCleanupSQL } from '@authvader/sdk/server';

console.log(getCleanupSQL({ expiredOlderThanDays: 30 }));
// DELETE FROM identity_sessions WHERE expires_at < NOW() - INTERVAL '30 days';
```

---

## Webhooks

Webhooks are verified using JWKS (JSON Web Key Set) from your AuthVader instance - no shared secrets needed!

### Using WebhookRouter

```typescript
import { WebhookRouter, IdentitySyncHandler } from '@authvader/sdk/server';

// Option 1: Use built-in IdentitySyncHandler for database mirroring
const router = new WebhookRouter({
  authVaderHost: process.env.AUTHVADER_HOST!,
  handler: new IdentitySyncHandler(prisma),
});

app.post('/webhooks/authvader', router.expressHandler());
```

### Custom Event Handler

```typescript
import { AuthVaderEventHandler, WebhookRouter } from '@authvader/sdk/server';

class MyEventHandler extends AuthVaderEventHandler {
  async onSubjectCreated(event) {
    // User registered
    await sendWelcomeEmail(event.data.email);
  }
  
  async onMemberJoined(event) {
    // User joined a tenant
    await notifyTeam(event.data.tenant_id, `${event.data.email} joined!`);
  }
  
  async onLicenseAssigned(event) {
    // User got a license
    await provisionResources(event.data.sub, event.data.license_type_name);
  }
  
  async onInviteAccepted(event) {
    // Invitation was accepted
    await notifyInviter(event.data.invited_by, event.data.email);
  }
}

const router = new WebhookRouter({
  authVaderHost: process.env.AUTHVADER_HOST!,
  handler: new MyEventHandler(),
});

app.post('/webhooks', router.expressHandler());
```

### Available Events

| Event | Method | Description |
|-------|--------|-------------|
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

## TypeScript Types

All types are exported for type-safe development:

```typescript
import type {
  // JWT & Auth
  EnhancedJwtPayload,
  ValidatedClaims,
  TokenResponse,
  
  // Identities (for sync)
  Identity,
  IdentitySession,
  IdentityCreateInput,
  IdentityUpdateInput,
  
  // OAuth Flow
  OAuthFlowConfig,
  StartFlowResult,
  StatePayload,
  
  // Invitations
  InvitationResponse,
  PendingInvitation,
  
  // Memberships
  TenantMembership,
  MembershipUser,
  
  // Licenses
  LicenseCheckResponse,
  LicenseGrantResponse,
  
  // Webhooks
  SyncEvent,
  SubjectCreatedEvent,
  MemberJoinedEvent,
  WebhookPayload,
} from '@authvader/sdk/server';
```

---

## Environment Variables

```bash
# Required
AUTHVADER_HOST=https://auth.yourapp.com
AUTHVADER_CLIENT_ID=your-client-id
AUTHVADER_CLIENT_SECRET=your-client-secret

# Optional (for OAuth flow)
AUTHVADER_REDIRECT_URI=https://yourapp.com/callback
```

---

## Documentation

For detailed documentation, see:

- **[JWT Validation Guide](./docs/jwt-validation.md)** - Deep dive into token verification
- **[Identity Sync Guide](./docs/identity-sync.md)** - Complete database mirroring setup
- **[Webhook Reference](./docs/webhooks.md)** - All events and payload schemas
- **[OAuth Flow Guide](./docs/oauth-flow.md)** - Server-side OAuth implementation
- **[API Reference](./docs/api-reference.md)** - Full SDK API documentation

---

## License

See [LICENSE](../../LICENSE) in the repository root for terms.

**TL;DR:** Free to use in your own projects. Modifications must be open-sourced. Commercial SaaS use requires written permission.
