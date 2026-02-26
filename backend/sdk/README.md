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
import { AuthVaderProvider, useAuthVader } from '@authvader/sdk/client';

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
  const { user, isAuthenticated, login, logout } = useAuthVader();
  
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

---

## User Sync (Local Database Mirroring)

The SDK provides tools for syncing AuthVader users to your local database, reducing API calls and enabling offline queries.

### Step 1: Add Prisma Schema

```typescript
import { printSchema } from '@authvader/sdk/server';

// Print schema to console, then copy to your schema.prisma
printSchema();
```

This outputs:

```prisma
model User {
  id            String    @id                      // AuthVader subject ID
  email         String?   @unique
  givenName     String?   @map("given_name")
  familyName    String?   @map("family_name")
  pictureUrl    String?   @map("picture_url")      // Profile picture
  thumbnailUrl  String?   @map("thumbnail_url")    // Small avatar
  tenantId      String?   @map("tenant_id")
  appRole       String?   @map("app_role")
  isActive      Boolean   @default(true)
  syncedAt      DateTime  @default(now())
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  sessions      UserSession[]
  
  // Add your app-specific fields below
  // posts         Post[]
  // preferences   Json @default("{}")
  
  @@map("users")
}

model UserSession {
  id            String    @id @default(cuid())
  userId        String    @map("user_id")
  user          User      @relation(...)
  authSessionId String?   @unique @map("auth_session_id")
  deviceInfo    String?   @map("device_info")
  ipAddress     String?   @map("ip_address")
  userAgent     String?   @map("user_agent")
  createdAt     DateTime  @default(now())
  lastActiveAt  DateTime  @default(now())
  expiresAt     DateTime
  revokedAt     DateTime?
  
  @@map("user_sessions")
}
```

### Step 2: Set Up Webhook Handler

```typescript
import { UserSyncHandler, WebhookRouter } from '@authvader/sdk/server';
import { prisma } from './prisma';

// Create the sync handler with your Prisma client
const syncHandler = new UserSyncHandler(prisma);

// Create the webhook router
const router = new WebhookRouter({
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
// DELETE FROM user_sessions WHERE expires_at < NOW() - INTERVAL '30 days';
```

---

## Webhooks

### Using the Event Handler

```typescript
import { AuthVaderEventHandler, WebhookRouter } from '@authvader/sdk/server';

class MyEventHandler extends AuthVaderEventHandler {
  async onSubjectCreated(event) {
    // User registered
    await sendWelcomeEmail(event.data.email);
  }
  
  async onMemberJoined(event) {
    // User joined a tenant
    await notifyTeam(event.tenant_id, `${event.data.email} joined!`);
  }
  
  async onLicenseAssigned(event) {
    // User got a license
    await provisionResources(event.data.sub, event.data.license_type_name);
  }
}

const router = new WebhookRouter({
  handler: new MyEventHandler(),
});

app.post('/webhooks', router.expressHandler());
```

### Available Events

| Event | Description |
|-------|-------------|
| `invite.created` | Invitation sent |
| `invite.accepted` | Invitation accepted |
| `invite.deleted` | Invitation revoked |
| `invite.expired` | Invitation expired |
| `subject.created` | User/service account created |
| `subject.updated` | User profile updated |
| `subject.deleted` | User deleted |
| `subject.deactivated` | User deactivated |
| `member.joined` | User joined tenant |
| `member.left` | User left tenant |
| `member.role_changed` | Member role changed |
| `member.suspended` | Member suspended |
| `member.activated` | Member reactivated |
| `app_access.granted` | App access granted |
| `app_access.revoked` | App access revoked |
| `app_access.role_changed` | App role changed |
| `license.assigned` | License assigned |
| `license.revoked` | License revoked |
| `license.changed` | License type changed |

---

## OAuth Flow Utilities

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

## URL Builders

Generate URLs for auth flows:

```typescript
import {
  getLoginUrl,
  getSignupUrl,
  getLogoutUrl,
  getPasswordResetUrl,
} from '@authvader/sdk/server';

const loginUrl = getLoginUrl({
  authVaderHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  redirectUri: 'https://yourapp.com/callback',
});

const signupUrl = getSignupUrl({
  authVaderHost: 'https://auth.yourapp.com',
  clientId: 'your-client-id',
  redirectUri: 'https://yourapp.com/callback',
});
```

---

## TypeScript Types

All types are exported for type-safe development:

```typescript
import type {
  // JWT & Auth
  EnhancedJwtPayload,
  ValidatedClaims,
  TokenResponse,
  
  // Users
  AuthVaderUserBase,
  AuthVaderUserCreate,
  AuthVaderUserUpdate,
  
  // Sessions
  UserSessionBase,
  SessionCleanupOptions,
  
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
} from '@authvader/sdk/server';
```

---

## Environment Variables

```bash
# Required
AUTHVADER_HOST=https://auth.yourapp.com
AUTHVADER_CLIENT_ID=your-client-id
AUTHVADER_CLIENT_SECRET=your-client-secret

# Optional
AUTHVADER_REDIRECT_URI=https://yourapp.com/callback
```

---

## License

MIT
