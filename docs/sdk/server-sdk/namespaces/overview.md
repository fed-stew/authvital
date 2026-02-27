# SDK Namespaces Overview

> Type-safe namespaced APIs for all AuthVital operations.

The AuthVital SDK organizes its methods into namespaces for clean, discoverable APIs.

## Available Namespaces

| Namespace | Description |
|-----------|-------------|
| [`auth`](./auth.md) | Register, login, password reset |
| [`users`](./users.md) | User profile and account management |
| [`mfa`](./mfa.md) | Multi-factor authentication setup and verification |
| [`sso`](./sso.md) | Single Sign-On provider management |
| [`tenants`](./tenants.md) | Tenant CRUD and SSO configuration |
| [`invitations`](./invitations.md) | Send, list, and revoke invitations |
| [`memberships`](./memberships.md) | Member management and role assignment |
| [`permissions`](./permissions.md) | Permission checks (API-based) |
| [`licenses`](./licenses.md) | License management and feature checks |
| [`sessions`](./sessions.md) | Session management and logout |
| [`entitlements`](./entitlements.md) | Quota and feature entitlements |
| [`admin`](./admin.md) | Instance-level administration |

## Usage Pattern

All namespaces are accessed through the main `authvital` client:

```typescript
import { createAuthVital } from '@authvital/sdk/server';

const authvital = createAuthVital({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
});

// Access namespaces
await authvital.invitations.send(req, { email: 'user@example.com' });
await authvital.memberships.listForTenant(req);
await authvital.licenses.check(req, undefined, 'app-123');
await authvital.sessions.list(req);
```

## Authentication Patterns

Namespace methods use different authentication patterns:

### JWT-Authenticated Methods

Most methods validate the JWT from the incoming request:

```typescript
// These extract user/tenant context from the JWT automatically
await authvital.invitations.send(req, { email: 'user@example.com' });
await authvital.memberships.listForTenant(req);
await authvital.sessions.list(req);
```

### M2M (Machine-to-Machine) Methods

Some methods use the SDK's client credentials for backend-to-backend calls:

```typescript
// These use client_credentials, no user JWT needed
const tenant = await authvital.tenants.get('tenant-123');
const roles = await authvital.memberships.getTenantRoles();
const overview = await authvital.licenses.getTenantOverview('tenant-123');
```

### Unauthenticated Methods

A few methods don't require authentication:

```typescript
// Public endpoints
await authvital.auth.register({ email, password });
await authvital.auth.forgotPassword(email);
const providers = await authvital.sso.getAvailableProviders();
```
